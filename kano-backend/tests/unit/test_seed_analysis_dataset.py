"""Smoke tests for ``scripts/seed_analysis_dataset.py`` — Story 5-8.

Validates the DB-free portion of the seeder: deterministic Likert pairs for
each forced-tie shape (``single_M``, ``tie_M_O``, ``tie_O_A``), the canonical
constants (20 features, 500 submissions), and a sanity check that the forced
distributions actually produce the expected dominant categories via the
pure ``compute_category`` function. Catches regressions where someone
accidentally maps ``tie_M_O`` to a non-MUSTBE-leaning Likert pair (a
common drift since the matrix labels are subtle).

DB-touching code paths (``_seed_populated_poll`` / ``_seed_empty_poll``) are
exercised manually during the Story 5-8 manual a11y sweep — they require a
live Postgres + the full app context, which the integration suite already
covers indirectly via ``test_analysis_api_perf.py``. Repeating that here
would just duplicate the testcontainer setup without new coverage.
"""

from __future__ import annotations

import importlib.util
import random
import sys
from pathlib import Path
from typing import Any

import pytest

from kano.services.kano_matrix import Category, compute_category

# Load the script by file path rather than importing through `scripts.…` —
# the repo's `scripts/` directory is not on `sys.path` by default, and the
# script tweaks `sys.path` for its own kano-package imports rather than
# expecting to be imported as a package.
BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
SEEDER_PATH = BACKEND_ROOT / "scripts" / "seed_analysis_dataset.py"


@pytest.fixture(scope="module")
def seeder() -> Any:
    spec = importlib.util.spec_from_file_location(
        "_seed_analysis_dataset_under_test", SEEDER_PATH
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    # Pin module under a non-colliding name so the real script is still
    # importable through its real path elsewhere if needed.
    sys.modules["_seed_analysis_dataset_under_test"] = module
    spec.loader.exec_module(module)
    return module


class TestSeedConstants:
    def test_published_dataset_shape_matches_nfr1(self, seeder: Any) -> None:
        # NFR1 ceiling is pinned to 20 features × 500 submissions. If either
        # constant ever drifts the perf gate no longer matches the PRD
        # commitment — this assertion is the cheap regression catch.
        assert seeder.NUM_FEATURES == 20
        assert seeder.NUM_SUBMISSIONS == 500

    def test_poll_ttl_matches_create_poll_contract(self, seeder: Any) -> None:
        # Story 3-2 fixed the poll TTL at 7 days; the seeded poll has to
        # mirror that so a manual sweep ~immediately after seeding sees
        # a non-expired poll.
        assert seeder.POLL_TTL_DAYS == 7

    def test_default_seed_is_documented_constant(self, seeder: Any) -> None:
        assert seeder.DEFAULT_SEED == 42


class TestLikertShapes:
    def test_single_m_pair_resolves_to_mustbe(self, seeder: Any) -> None:
        rng = random.Random(42)
        fq, dq = seeder._likert_pair_for_shape("single_M", rng)
        # (2, 5) is the canonical MUSTBE cell per kano_matrix._MATRIX —
        # NOT (1, 5), which lands on PERFORMANCE. Pinning the exact pair plus
        # the matrix output catches drift in either direction.
        assert (fq, dq) == (2, 5)
        assert compute_category(fq, dq) is Category.MUSTBE

    def test_tie_m_o_alternates_between_mustbe_and_performance(self, seeder: Any) -> None:
        # 200 draws is plenty to hit both branches; assert both categories
        # appear at least once. The exact split depends on the RNG state,
        # but ~50/50 is the design.
        rng = random.Random(42)
        cats: set[Category] = set()
        for _ in range(200):
            fq, dq = seeder._likert_pair_for_shape("tie_M_O", rng)
            cats.add(compute_category(fq, dq))
        assert Category.MUSTBE in cats
        assert Category.PERFORMANCE in cats
        # And NO third category leaks in — the shape is a clean two-way tie.
        assert cats == {Category.MUSTBE, Category.PERFORMANCE}

    def test_tie_o_a_alternates_between_performance_and_attractive(self, seeder: Any) -> None:
        rng = random.Random(42)
        cats: set[Category] = set()
        for _ in range(200):
            fq, dq = seeder._likert_pair_for_shape("tie_O_A", rng)
            cats.add(compute_category(fq, dq))
        assert Category.PERFORMANCE in cats
        assert Category.ATTRACTIVE in cats
        assert cats == {Category.PERFORMANCE, Category.ATTRACTIVE}

    def test_random_shape_emits_uniformly_over_full_5x5_grid(self, seeder: Any) -> None:
        rng = random.Random(42)
        seen: set[tuple[int, int]] = set()
        for _ in range(1000):
            fq, dq = seeder._likert_pair_for_shape("random", rng)
            assert 1 <= fq <= 5
            assert 1 <= dq <= 5
            seen.add((fq, dq))
        # 1000 draws from a 25-cell space should hit every cell with high
        # probability — flake-prone only if the RNG is degenerate.
        assert seen == {(fq, dq) for fq in range(1, 6) for dq in range(1, 6)}


class TestShapeForFeatureIndex:
    def test_feature_0_is_single_dominant_must_have(self, seeder: Any) -> None:
        assert seeder._shape_for_feature_index(0) == "single_M"

    def test_feature_1_is_two_way_tie_m_o(self, seeder: Any) -> None:
        # The manual VoiceOver sweep references "Feature 02" as the
        # tied-dominant row (idx=1, name "Feature 02" per the f-string).
        assert seeder._shape_for_feature_index(1) == "tie_M_O"

    def test_feature_2_is_two_way_tie_o_a(self, seeder: Any) -> None:
        assert seeder._shape_for_feature_index(2) == "tie_O_A"

    def test_features_3_through_19_are_random(self, seeder: Any) -> None:
        for idx in range(3, 20):
            assert seeder._shape_for_feature_index(idx) == "random", (
                f"feature {idx} drifted off the random distribution"
            )
