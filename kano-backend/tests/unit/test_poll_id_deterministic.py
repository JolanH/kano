"""Unit tests for the deterministic poll-id helper.

``_deterministic_poll_id`` is the load-bearing guarantee behind "exactly one
poll per (project, epoch)": same inputs → same UUIDv5 → same primary key, so a
duplicate insert is impossible by construction. These tests pin that contract
without touching the database.
"""

from __future__ import annotations

from uuid import UUID, uuid5

from kano.services.poll_service import POLL_ID_NAMESPACE, _deterministic_poll_id


def test_is_stable_for_same_inputs() -> None:
    pid = UUID("11111111-1111-1111-1111-111111111111")
    assert _deterministic_poll_id(pid, 3) == _deterministic_poll_id(pid, 3)


def test_is_uuid_version_5() -> None:
    pid = UUID("11111111-1111-1111-1111-111111111111")
    assert _deterministic_poll_id(pid, 1).version == 5


def test_differs_by_epoch() -> None:
    pid = UUID("11111111-1111-1111-1111-111111111111")
    assert _deterministic_poll_id(pid, 1) != _deterministic_poll_id(pid, 2)


def test_differs_by_project() -> None:
    a = UUID("11111111-1111-1111-1111-111111111111")
    b = UUID("22222222-2222-2222-2222-222222222222")
    assert _deterministic_poll_id(a, 1) != _deterministic_poll_id(b, 1)


def test_matches_explicit_namespace_formula() -> None:
    pid = UUID("33333333-3333-3333-3333-333333333333")
    assert _deterministic_poll_id(pid, 7) == uuid5(POLL_ID_NAMESPACE, f"{pid}:7")
