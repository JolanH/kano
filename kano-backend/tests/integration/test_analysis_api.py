"""Integration tests for ``GET /api/v1/polls/:uuid/analysis`` (Story 5.2).

Sibling to ``test_polls_public_api.py`` and ``test_poll_submit_api.py``: the
auth model is the same public surface (no CSRF, no session, UUIDv4 is the
sole access control). Tests assert the wire shape Story 5.1 promises
(``PollAnalysis.model_dump(mode="json")``), the FR32 "200 on expired"
contract that intentionally diverges from Story 3.4's 410, the FR35 tie
shape, the FR37 empty-state shape, and the public CORS / CSRF surface.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import structlog
from flask.testing import FlaskClient
from sqlalchemy import Engine, text

from kano.services.kano_matrix import compute_category

# app_with_migrated_db / client_migrated / db_engine come from
# tests/integration/conftest.py — same DB+app boilerplate every integration
# file shares.


# --- Seed helpers (parallels test_analysis_service.py for cross-test parity) -


def _seed_project(engine: Engine, *, name: str = "Analysis API Test", epoch: int = 1) -> UUID:
    project_id = uuid4()
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO projects (id, name, version, current_epoch) "
                "VALUES (:id, :name, '1.0', :epoch)"
            ),
            {"id": project_id, "name": name, "epoch": epoch},
        )
    return project_id


def _seed_feature(
    engine: Engine,
    *,
    project_id: UUID,
    name: str,
    description: str | None = None,
    epoch: int = 1,
) -> tuple[UUID, UUID]:
    feature_id = uuid4()
    feature_key = uuid4()
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO features "
                "(id, feature_key, project_id, epoch, name, description, is_active) "
                "VALUES (:id, :key, :pid, :epoch, :name, :desc, TRUE)"
            ),
            {
                "id": feature_id,
                "key": feature_key,
                "pid": project_id,
                "epoch": epoch,
                "name": name,
                "desc": description,
            },
        )
    return feature_id, feature_key


def _seed_poll(
    engine: Engine,
    *,
    project_id: UUID,
    epoch: int = 1,
    expires_at: datetime | None = None,
) -> UUID:
    poll_id = uuid4()
    now = datetime.now(tz=UTC)
    expires = expires_at if expires_at is not None else now + timedelta(days=7)
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO polls (id, project_id, epoch, created_at, expires_at) "
                "VALUES (:id, :pid, :epoch, :created, :expires)"
            ),
            {
                "id": poll_id,
                "pid": project_id,
                "epoch": epoch,
                "created": now,
                "expires": expires,
            },
        )
    return poll_id


def _seed_submission(
    engine: Engine,
    *,
    poll_id: UUID,
    responses: list[tuple[UUID, int, int]],
) -> UUID:
    submission_id = uuid4()
    now = datetime.now(tz=UTC)
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO submissions (id, poll_id, submitted_at) VALUES (:id, :pid, :ts)"),
            {"id": submission_id, "pid": poll_id, "ts": now},
        )
        for feature_id, fq, dq in responses:
            conn.execute(
                text(
                    "INSERT INTO responses "
                    "(submission_id, feature_id, fq_answer, dq_answer, category) "
                    "VALUES (:sid, :fid, :fq, :dq, :cat)"
                ),
                {
                    "sid": submission_id,
                    "fid": feature_id,
                    "fq": fq,
                    "dq": dq,
                    "cat": compute_category(fq, dq).value,
                },
            )
    return submission_id


def _problem(response_data: bytes) -> dict[str, object]:
    parsed: dict[str, object] = json.loads(response_data)
    return parsed


# --- AC #1, #2 — happy path + always-six-keys distribution -------------------


class TestGetAnalysisHappyPath:
    def test_happy_path_returns_full_payload_shape(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        # Seed: 3 features × 5 submissions with known (fq, dq) cells →
        # known categories: (3, 5) → MANDATORY; (1, 5) → LINEAR; (1, 3) → EXCITER.
        project_id = _seed_project(db_engine)
        fid_a, fkey_a = _seed_feature(
            db_engine, project_id=project_id, name="Auto-save", description="desc-A"
        )
        fid_b, fkey_b = _seed_feature(
            db_engine, project_id=project_id, name="Dark mode", description=None
        )
        fid_c, fkey_c = _seed_feature(
            db_engine, project_id=project_id, name="Offline mode", description="desc-C"
        )
        poll_id = _seed_poll(db_engine, project_id=project_id)

        for _ in range(5):
            _seed_submission(
                db_engine,
                poll_id=poll_id,
                responses=[
                    (fid_a, 3, 5),  # MANDATORY
                    (fid_b, 1, 5),  # LINEAR
                    (fid_c, 1, 3),  # EXCITER
                ],
            )

        bare = client_migrated.application.test_client()
        response = bare.get(f"/api/v1/polls/{poll_id}/analysis")

        assert response.status_code == 200, response.data
        body = json.loads(response.data)

        # Top-level keys — exact set (no extras, no omissions).
        assert set(body.keys()) == {"poll_id", "epoch", "total_submissions", "features"}
        assert UUID(body["poll_id"]) == poll_id
        assert body["epoch"] == 1
        assert body["total_submissions"] == 5
        assert isinstance(body["features"], list)
        assert len(body["features"]) == 3

        # Each feature has exactly the contract shape.
        for feature in body["features"]:
            assert set(feature.keys()) == {
                "feature_key",
                "name",
                "description",
                "distribution",
                "dominant_categories",
                "dominant_percentage",
            }
            # AC #2 — distribution always carries all six category keys.
            assert set(feature["distribution"].keys()) == {"M", "L", "E", "I", "C", "D"}
            # dominant_categories is a list, dominant_percentage is a number.
            assert isinstance(feature["dominant_categories"], list)
            assert isinstance(feature["dominant_percentage"], int | float)

        by_key = {UUID(f["feature_key"]): f for f in body["features"]}

        # Feature A: 5 × MANDATORY.
        assert by_key[fkey_a]["name"] == "Auto-save"
        assert by_key[fkey_a]["description"] == "desc-A"
        assert by_key[fkey_a]["distribution"] == {
            "M": 5,
            "L": 0,
            "E": 0,
            "I": 0,
            "C": 0,
            "D": 0,
        }
        assert by_key[fkey_a]["dominant_categories"] == ["M"]
        assert by_key[fkey_a]["dominant_percentage"] == 100.0

        # Feature B: 5 × LINEAR (description may serialize as None).
        assert by_key[fkey_b]["name"] == "Dark mode"
        assert by_key[fkey_b]["description"] is None
        assert by_key[fkey_b]["distribution"]["L"] == 5
        assert by_key[fkey_b]["dominant_categories"] == ["L"]
        assert by_key[fkey_b]["dominant_percentage"] == 100.0

        # Feature C: 5 × EXCITER.
        assert by_key[fkey_c]["distribution"]["E"] == 5
        assert by_key[fkey_c]["dominant_categories"] == ["E"]
        assert by_key[fkey_c]["dominant_percentage"] == 100.0


# --- AC #3 — empty / zero-submission FR37 contract ---------------------------


class TestGetAnalysisZeroSubmissions:
    def test_zero_submissions_returns_empty_state_shape(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        project_id = _seed_project(db_engine)
        _seed_feature(db_engine, project_id=project_id, name="A")
        _seed_feature(db_engine, project_id=project_id, name="B")
        _seed_feature(db_engine, project_id=project_id, name="C")
        poll_id = _seed_poll(db_engine, project_id=project_id)

        bare = client_migrated.application.test_client()
        response = bare.get(f"/api/v1/polls/{poll_id}/analysis")

        assert response.status_code == 200, response.data
        body = json.loads(response.data)

        assert body["total_submissions"] == 0
        assert len(body["features"]) == 3
        for feature in body["features"]:
            # All six keys present, all zero — Story 5.4's stacked bar reads
            # this verbatim and renders the empty-state segment.
            assert feature["distribution"] == {
                "M": 0,
                "L": 0,
                "E": 0,
                "I": 0,
                "C": 0,
                "D": 0,
            }
            assert feature["dominant_categories"] == []
            assert feature["dominant_percentage"] == 0.0


# --- FR35 tie shape on the wire ----------------------------------------------


class TestGetAnalysisTieHandling:
    def test_two_way_tie_returns_sorted_winners_list(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        # 4 submissions: 2 × M, 2 × L on one feature. FR35 surfaces both
        # winners; sort is by Category.value so the order is ["L", "M"].
        project_id = _seed_project(db_engine)
        fid, _ = _seed_feature(db_engine, project_id=project_id, name="Solo")
        poll_id = _seed_poll(db_engine, project_id=project_id)

        # (3, 5) → MANDATORY; (1, 5) → LINEAR.
        for _ in range(2):
            _seed_submission(db_engine, poll_id=poll_id, responses=[(fid, 3, 5)])
        for _ in range(2):
            _seed_submission(db_engine, poll_id=poll_id, responses=[(fid, 1, 5)])

        bare = client_migrated.application.test_client()
        body = json.loads(bare.get(f"/api/v1/polls/{poll_id}/analysis").data)

        assert body["total_submissions"] == 4
        feature = body["features"][0]
        # Canonical Kano scan order (M → L → E → I → C → D): M precedes L.
        assert feature["dominant_categories"] == ["M", "L"]
        assert feature["dominant_percentage"] == 50.0


# --- AC #4 — 404 Problem Details for unknown UUID ----------------------------


class TestGetAnalysisUnknownPoll:
    def test_unknown_uuid_returns_404_problem_details(
        self,
        client_migrated: FlaskClient,
    ) -> None:
        bare = client_migrated.application.test_client()
        random_id = uuid4()
        response = bare.get(f"/api/v1/polls/{random_id}/analysis")

        assert response.status_code == 404, response.data
        assert response.mimetype == "application/problem+json"
        body = _problem(response.data)
        # Per AC #4: type, title, status, detail, request_id all present.
        assert body["type"] == "https://kano.example.com/problems/entity-not-found"
        assert body["status"] == 404
        assert body["title"]
        assert str(random_id) in str(body["detail"])
        assert body["request_id"] is not None


# --- AC #5 — expired polls remain readable (FR32) ----------------------------


class TestGetAnalysisExpiredPoll:
    def test_expired_poll_returns_200_with_full_payload(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        # FR32: analysis remains readable after the 7-day TTL — the PM
        # reviews results after expiry. Deliberately diverges from Story 3.4's
        # 410-on-expired for the respondent-facing `GET /api/v1/polls/:uuid`.
        project_id = _seed_project(db_engine)
        fid, _ = _seed_feature(db_engine, project_id=project_id, name="Solo")
        poll_id = _seed_poll(
            db_engine,
            project_id=project_id,
            expires_at=datetime.now(tz=UTC) - timedelta(days=1),
        )

        # (3, 5) → MANDATORY × 3.
        for _ in range(3):
            _seed_submission(db_engine, poll_id=poll_id, responses=[(fid, 3, 5)])

        bare = client_migrated.application.test_client()
        response = bare.get(f"/api/v1/polls/{poll_id}/analysis")

        # 200, not 410 — contrast with Story 3.4 / test_polls_public_api.py.
        assert response.status_code == 200, response.data
        body = json.loads(response.data)
        assert body["total_submissions"] == 3
        assert len(body["features"]) == 1
        assert body["features"][0]["distribution"]["M"] == 3
        assert body["features"][0]["dominant_categories"] == ["M"]


# --- AC #6 — CSRF exemption ---------------------------------------------------


class TestGetAnalysisCsrfExempt:
    def test_no_csrf_token_no_session_returns_200(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        project_id = _seed_project(db_engine)
        _seed_feature(db_engine, project_id=project_id, name="A")
        poll_id = _seed_poll(db_engine, project_id=project_id)

        # Pristine client — never touches /api/v1/csrf-token, sends no header.
        bare = client_migrated.application.test_client()
        response = bare.get(f"/api/v1/polls/{poll_id}/analysis")

        # 200, not 403 — Flask-WTF CSRFProtect only enforces on state-changing
        # methods, but the analysis endpoint must also be reachable from
        # cross-origin contexts with no cached token at all.
        assert response.status_code == 200, response.data


# --- AC #7 — CORS-open from any origin ---------------------------------------


class TestGetAnalysisCorsOpen:
    def test_cross_origin_get_includes_acao_header(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        project_id = _seed_project(db_engine)
        _seed_feature(db_engine, project_id=project_id, name="A")
        poll_id = _seed_poll(db_engine, project_id=project_id)

        third_party_origin = "https://random-third-party.example"
        bare = client_migrated.application.test_client()
        response = bare.get(
            f"/api/v1/polls/{poll_id}/analysis",
            headers={"Origin": third_party_origin},
        )

        assert response.status_code == 200, response.data
        # Per Story 5.2 AC #7 + the `public_resource` config in
        # middleware/security.py, the public surface is `origins="*"`.
        # Flask-CORS legitimately renders the response header as either
        # the literal `*` or by echoing the Origin (when an Origin is
        # present and matches the wildcard) — both are valid "open" responses
        # and the choice is internal to Flask-CORS. Accept either.
        acao = response.headers.get("Access-Control-Allow-Origin")
        assert acao in ("*", third_party_origin), (
            f"Expected public CORS surface; got ACAO={acao!r}. "
            "PUBLIC_RESPONDENT_PATHS in middleware/security.py must cover "
            "/api/v1/polls/<uuid>/analysis."
        )
        # The PM allowlist requires credentials; the public surface must NOT —
        # supports_credentials=True is incompatible with `*` and would leak the
        # PM session cookie cross-origin. Tight check: header must be absent
        # entirely OR explicitly "false"; any other value (including a stray
        # "True" / "1" from misconfiguration) is a leak.
        assert response.headers.get("Access-Control-Allow-Credentials") in (
            None,
            "false",
        ), response.headers.get("Access-Control-Allow-Credentials")

    def test_preflight_options_succeeds(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        project_id = _seed_project(db_engine)
        _seed_feature(db_engine, project_id=project_id, name="A")
        poll_id = _seed_poll(db_engine, project_id=project_id)

        third_party_origin = "https://random-third-party.example"
        bare = client_migrated.application.test_client()
        response = bare.options(
            f"/api/v1/polls/{poll_id}/analysis",
            headers={
                "Origin": third_party_origin,
                "Access-Control-Request-Method": "GET",
            },
        )

        # 200 / 204 are both acceptable from Flask-CORS preflight; the gate
        # is that the ACAO header authorizes the cross-origin GET.
        assert response.status_code in (200, 204), response.data
        assert response.headers.get("Access-Control-Allow-Origin") in (
            "*",
            third_party_origin,
        )


# --- Frozen snapshot after epoch bump ----------------------------------------


class TestGetAnalysisSnapshotFrozen:
    def test_frozen_after_epoch_bump(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        # Mirrors test_polls_public_api.py and test_analysis_service.py:
        # the (project_id, epoch) snapshot is the contract. Bumping the
        # project's current_epoch never alters the poll's analysis surface.
        project_id = _seed_project(db_engine)
        fid_a_e1, fkey_a_e1 = _seed_feature(
            db_engine, project_id=project_id, epoch=1, name="A"
        )
        fid_b_e1, fkey_b_e1 = _seed_feature(
            db_engine, project_id=project_id, epoch=1, name="B"
        )
        poll_id = _seed_poll(db_engine, project_id=project_id, epoch=1)

        for _ in range(3):
            _seed_submission(
                db_engine,
                poll_id=poll_id,
                responses=[
                    (fid_a_e1, 3, 5),  # MANDATORY
                    (fid_b_e1, 1, 5),  # LINEAR
                ],
            )

        # Bump the project to epoch 2 + add a third feature on epoch 2 only.
        with db_engine.begin() as conn:
            conn.execute(
                text("UPDATE projects SET current_epoch = 2 WHERE id = :pid"),
                {"pid": project_id},
            )
        _seed_feature(db_engine, project_id=project_id, epoch=2, name="A")
        _seed_feature(db_engine, project_id=project_id, epoch=2, name="B")
        _seed_feature(db_engine, project_id=project_id, epoch=2, name="C")

        bare = client_migrated.application.test_client()
        body = json.loads(bare.get(f"/api/v1/polls/{poll_id}/analysis").data)

        assert body["epoch"] == 1
        assert body["total_submissions"] == 3
        assert len(body["features"]) == 2
        keys = {UUID(f["feature_key"]) for f in body["features"]}
        assert keys == {fkey_a_e1, fkey_b_e1}


# --- AC #10 — structlog emission contract ------------------------------------


class TestGetAnalysisLogging:
    def test_emits_poll_analysis_read_event(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        project_id = _seed_project(db_engine)
        fid, _ = _seed_feature(db_engine, project_id=project_id, name="A")
        poll_id = _seed_poll(db_engine, project_id=project_id)
        for _ in range(2):
            _seed_submission(db_engine, poll_id=poll_id, responses=[(fid, 3, 5)])

        bare = client_migrated.application.test_client()
        with structlog.testing.capture_logs() as captured:
            response = bare.get(f"/api/v1/polls/{poll_id}/analysis")
        assert response.status_code == 200, response.data

        recorded = [e for e in captured if e.get("event") == "poll_analysis_read"]
        assert len(recorded) == 1, (
            f"Expected exactly one `poll_analysis_read` event; got {recorded}"
        )
        entry = recorded[0]
        assert entry["poll_id"] == str(poll_id)
        assert entry["epoch"] == 1
        assert entry["feature_count"] == 1
        assert entry["total_submissions"] == 2

    def test_log_event_carries_no_pii_or_descriptions(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        # NFR8 — counts + IDs only. No feature names, no descriptions, no
        # respondent data should ever appear in the analysis-read log line.
        secret_name = "ULTRA-SECRET-FEATURE-NAME-XYZ"
        secret_desc = "INTERNAL-WORDING-DO-NOT-LEAK"
        project_id = _seed_project(db_engine)
        fid, _ = _seed_feature(
            db_engine, project_id=project_id, name=secret_name, description=secret_desc
        )
        poll_id = _seed_poll(db_engine, project_id=project_id)
        _seed_submission(db_engine, poll_id=poll_id, responses=[(fid, 3, 5)])

        bare = client_migrated.application.test_client()
        with structlog.testing.capture_logs() as captured:
            bare.get(f"/api/v1/polls/{poll_id}/analysis")

        recorded = [e for e in captured if e.get("event") == "poll_analysis_read"]
        assert len(recorded) == 1
        serialized = json.dumps(recorded[0], default=str)
        assert secret_name not in serialized
        assert secret_desc not in serialized
