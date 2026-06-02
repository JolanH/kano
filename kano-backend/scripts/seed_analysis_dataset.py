"""Seed a deterministic 20-feature × 500-submission analysis dataset.

Run standalone::

    poetry run python scripts/seed_analysis_dataset.py

The script bootstraps the Flask app (`create_app`) to acquire a SQLAlchemy
session, creates one new ``Project`` with 20 active features on epoch 1, a
single ``Poll`` pinned to epoch 1 with a 7-day TTL, and 500 ``Submission``
rows with one ``Response`` per feature — 10,000 response rows in total,
matching NFR1's published dataset shape.

A second ``Project`` + ``Poll`` pair is created with zero submissions so the
empty-state surface can be verified against the same backend in the same
session (manual VoiceOver / axe-core sweeps, Story 5-8 AC #2 / AC #6).

The IDs of the created project + populated poll + empty poll are printed to
stdout in a `key=value` format easy to capture in a shell variable or
Playwright global-setup script. The dataset is deterministic when the same
``--seed`` value is used (default 42); rerunning the script produces a
*new* project + poll pair (uuid4 is non-deterministic at the DB layer), but
the response distribution per feature is reproducible.

Why this script is the load-bearing reference dataset for Story 5-8:

- The NFR1 ceiling (3 s p95) is published against the 20 × 500 shape.
- The FR35 tie scenario is forced into the dataset (see ``_force_tie``)
  so the manual VoiceOver tie-announcement sweep has a known feature row
  to read against, instead of relying on random distribution luck.
- The manual a11y checklist (``kano-frontend/docs/a11y/analysis-checklist.md``)
  references the printed `project_id` / `poll_id` for the seeded run.

Usage notes:

- Requires the standard ``DATABASE_URL`` env var (or defaults to the local
  dev Postgres). Running against a deployed environment would mutate that
  database — point it at a local container before invoking.
- Idempotency: the script creates fresh rows on every invocation. There is
  no cleanup; rerun against a fresh DB (or accept the accumulated rows).
"""

from __future__ import annotations

import argparse
import random
import sys
from datetime import UTC, datetime, timedelta

# Ensure `src/` is on sys.path when invoked as a standalone script from the
# kano-backend repo root.
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC_ROOT = REPO_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))


# `noqa: E402` — sys.path tweak above must precede the kano-package imports.
from kano import create_app  # noqa: E402
from kano.db import db  # noqa: E402
from kano.models import Feature, Poll, Project, Response, Submission  # noqa: E402
from kano.services.kano_matrix import compute_category  # noqa: E402

DEFAULT_SEED = 42
NUM_FEATURES = 20
NUM_SUBMISSIONS = 500
POLL_TTL_DAYS = 7


def _build_features(project_id: UUID, count: int) -> list[Feature]:
    """Create ``count`` features for ``project_id`` on epoch 1."""

    return [
        Feature(
            id=uuid4(),
            project_id=project_id,
            epoch=1,
            feature_key=uuid4(),
            name=f"Feature {i + 1:02d}",
            description=f"Auto-generated description for Feature {i + 1:02d}",
            is_active=True,
        )
        for i in range(count)
    ]


def _force_tie_indices(num_features: int) -> set[int]:
    """Pin specific feature indices into deterministic distribution shapes.

    Why pin a tie: the manual VoiceOver sweep (AC #5) needs a known row
    where the Dominant cell announces "tied dominant, A and B, X% each".
    Random Likert pairs at 500 submissions almost always produce a single
    dominant; we'd flake the test by relying on chance. Hard-coded indices
    here keep the row stable across `--seed` changes.

    Returned indices align with `_build_responses_for_feature`:

    - ``0`` — feature dominates single-category Must-be (high M signal)
    - ``1`` — feature ties between Must-be and Performance (M ≈ O)
    - ``2`` — feature ties between Performance and Attractive (O ≈ A)
    """

    _ = num_features  # kept in the signature for future scaling.
    return {0, 1, 2}


# Per-shape call counter used by the tied shapes to deliver exact alternation
# (call N → branch A, call N+1 → branch B). Bernoulli sampling at p=0.5 over
# 500 submissions can drift 50/50 by tens of responses, which would let the
# FR35 manual VoiceOver "tied 50/50" checklist row read as a near-tie rather
# than an exact tie. Module-level state is intentional: the seeder is a one-
# shot script, and the unit tests run each shape's draws against a single
# module fixture so accumulated counts don't leak across an invocation.
_TIE_COUNTERS: dict[str, int] = {}


def _next_tie_index(shape: str) -> int:
    """Return the next 0-based call index for ``shape`` and advance the counter."""

    idx = _TIE_COUNTERS.get(shape, 0)
    _TIE_COUNTERS[shape] = idx + 1
    return idx


def _likert_pair_for_shape(shape: str, rng: random.Random) -> tuple[int, int]:
    """Return a (functional, dysfunctional) Likert pair biased toward ``shape``.

    Pairs are chosen from the canonical Kano matrix
    (``kano_matrix._MATRIX``) — "like it / dislike it" intuition is misleading
    because (1, 5) lands on PERFORMANCE, not MUSTBE:

    - MUSTBE: (2, 5) | (3, 5) | (4, 5)  (functional is lukewarm-to-
      negative, dysfunctional is "I dislike it" → the feature is a hygiene
      requirement).
    - PERFORMANCE: (1, 5)  (the only Performance cell).
    - ATTRACTIVE: (1, 2) | (1, 3) | (1, 4).

    Shapes the manual sweep needs:

    - ``"single_M"`` — heavily Must-be: returns the prototypical (2, 5)
      MUSTBE cell on every call.
    - ``"tie_M_O"`` — 50/50 between Must-be and Performance — true
      alternation between (2, 5) MUSTBE (even calls) and (1, 5) PERFORMANCE
      (odd calls). 500 submissions yield exactly 250 of each.
    - ``"tie_O_A"`` — 50/50 between Performance and Attractive — true
      alternation between (1, 5) PERFORMANCE (even calls) and (1, 3)
      ATTRACTIVE (odd calls). 500 submissions yield exactly 250 of each.
    - ``"random"`` — uniformly random over the 5 × 5 space.

    The ``rng`` argument is only consumed by ``"random"``; the tied shapes
    use the deterministic per-shape counter in ``_TIE_COUNTERS`` instead so
    the FR35 50/50 manual VoiceOver row is exact rather than approximate.
    """

    if shape == "single_M":
        return (2, 5)
    if shape == "tie_M_O":
        return (2, 5) if _next_tie_index(shape) % 2 == 0 else (1, 5)
    if shape == "tie_O_A":
        return (1, 5) if _next_tie_index(shape) % 2 == 0 else (1, 3)
    return (rng.randint(1, 5), rng.randint(1, 5))


def _shape_for_feature_index(idx: int) -> str:
    if idx == 0:
        return "single_M"
    if idx == 1:
        return "tie_M_O"
    if idx == 2:
        return "tie_O_A"
    return "random"


def _seed_populated_poll(rng: random.Random) -> dict[str, UUID]:
    """Create the populated 20×500 dataset and return its identifying UUIDs."""

    now = datetime.now(UTC)
    project = Project(
        id=uuid4(),
        name="Analysis perf seed",
        version="1.0",
        current_epoch=1,
    )
    db.session.add(project)
    db.session.flush()  # project.id is now available for FK assignment.

    features = _build_features(project.id, NUM_FEATURES)
    db.session.add_all(features)
    db.session.flush()

    poll = Poll(
        id=uuid4(),
        project_id=project.id,
        epoch=1,
        expires_at=now + timedelta(days=POLL_TTL_DAYS),
    )
    db.session.add(poll)
    db.session.flush()

    # Build 500 submissions × 20 responses each. Batch the inserts via the
    # session's autoflush — committing at the end keeps the script under a
    # few seconds on a modest dev box.
    for _ in range(NUM_SUBMISSIONS):
        submission = Submission(id=uuid4(), poll_id=poll.id)
        db.session.add(submission)
        db.session.flush()

        for idx, feature in enumerate(features):
            shape = _shape_for_feature_index(idx)
            fq, dq = _likert_pair_for_shape(shape, rng)
            category = compute_category(fq, dq).value
            db.session.add(
                Response(
                    submission_id=submission.id,
                    feature_id=feature.id,
                    fq_answer=fq,
                    dq_answer=dq,
                    category=category,
                )
            )

    db.session.commit()
    return {"project_id": project.id, "poll_id": poll.id}


def _seed_empty_poll() -> dict[str, UUID]:
    """Create a sibling project + poll with zero submissions for empty-state runs."""

    now = datetime.now(UTC)
    project = Project(
        id=uuid4(),
        name="Analysis perf seed (empty)",
        version="1.0",
        current_epoch=1,
    )
    db.session.add(project)
    db.session.flush()

    features = _build_features(project.id, NUM_FEATURES)
    db.session.add_all(features)
    db.session.flush()

    poll = Poll(
        id=uuid4(),
        project_id=project.id,
        epoch=1,
        expires_at=now + timedelta(days=POLL_TTL_DAYS),
    )
    db.session.add(poll)
    db.session.commit()

    return {"project_id": project.id, "poll_id": poll.id}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=DEFAULT_SEED,
        help=f"Random seed for the Likert distribution (default: {DEFAULT_SEED}).",
    )
    args = parser.parse_args(argv)

    rng = random.Random(args.seed)
    app = create_app()

    with app.app_context():
        populated = _seed_populated_poll(rng)
        empty = _seed_empty_poll()

    # Emit `key=value` lines for easy capture in Bash:
    #   eval "$(poetry run python scripts/seed_analysis_dataset.py)"
    print(f"project_id={populated['project_id']}")
    print(f"poll_id={populated['poll_id']}")
    print(f"empty_project_id={empty['project_id']}")
    print(f"empty_poll_id={empty['poll_id']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


__all__: list[Any] = []
