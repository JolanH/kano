"""Feature-mutation endpoints (PM-facing, CSRF-protected, epoch-gated).

Every mutation routes through :func:`kano.services.epoch_service.bump_epoch_on_feature_change`
— no direct ``features`` writes in this blueprint. The architecture's
§Enforcement Guidelines makes that the load-bearing rule for Epic 2.

Endpoints share an ``acknowledged`` JSON body field; the SPA's two-register
dialog (Story 2-11) re-issues the same request with ``{"acknowledged": true}``
in the body after the user confirms a 409 ``epoch-bump-required`` response.
Body rather than query string so the ack does not leak into access logs,
referrers, or link-prefetch behaviors.
"""

from __future__ import annotations

from uuid import UUID, uuid4

from flask import Blueprint, Response, jsonify, request
from sqlalchemy import select

from kano.db import db
from kano.exceptions import EntityNotFound
from kano.models.feature import Feature
from kano.schemas.feature import FeatureCreate, FeatureResponse, FeatureUpdate
from kano.services import epoch_service, feature_service

features_bp = Blueprint(
    "features",
    __name__,
    url_prefix="/api/v1/projects/<uuid:project_id>",
)


def _acknowledged() -> bool:
    """Read ``acknowledged`` boolean from the request JSON body.

    Strict ``is True`` check: stringy truthy values are rejected. ``DELETE``
    requests with no body are handled by ``silent=True`` returning ``None``.
    """

    body = request.get_json(silent=True) or {}
    return body.get("acknowledged") is True


def _load_active_feature(project_id: UUID, epoch: int, feature_key: UUID) -> Feature:
    stmt = select(Feature).where(
        Feature.project_id == project_id,
        Feature.epoch == epoch,
        Feature.feature_key == feature_key,
        Feature.is_active.is_(True),
    )
    feature = db.session.execute(stmt).scalar_one_or_none()
    if feature is None:
        raise EntityNotFound(f"Feature {feature_key} not found at epoch {epoch}")
    return feature


@features_bp.post("/features")
def create_feature(project_id: UUID) -> tuple[Response, int]:
    body = FeatureCreate.model_validate(request.get_json())

    created: dict[str, Feature] = {}

    def mutation(epoch: int) -> None:
        feature = Feature(
            id=uuid4(),
            project_id=project_id,
            epoch=epoch,
            feature_key=uuid4(),
            name=body.name,
            description=body.description,
        )
        db.session.add(feature)
        # Flush so the row picks up its DB-side defaults (created_at) before
        # we serialize it for the response.
        db.session.flush()
        created["feature"] = feature

    epoch_service.bump_epoch_on_feature_change(
        project_id,
        mutation,
        acknowledged=_acknowledged(),
    )

    payload = FeatureResponse.model_validate(created["feature"]).model_dump(mode="json")
    return jsonify(payload), 201


@features_bp.patch("/features/<uuid:feature_key>")
def update_feature(project_id: UUID, feature_key: UUID) -> tuple[Response, int]:
    body = FeatureUpdate.model_validate(request.get_json())

    updated: dict[str, Feature] = {}

    def mutation(epoch: int) -> None:
        feature = _load_active_feature(project_id, epoch, feature_key)
        for field, value in body.model_dump(exclude_unset=True).items():
            setattr(feature, field, value)
        updated["feature"] = feature

    epoch_service.bump_epoch_on_feature_change(
        project_id,
        mutation,
        acknowledged=_acknowledged(),
    )

    payload = FeatureResponse.model_validate(updated["feature"]).model_dump(mode="json")
    return jsonify(payload), 200


@features_bp.delete("/features/<uuid:feature_key>")
def delete_feature(project_id: UUID, feature_key: UUID) -> tuple[Response, int]:
    """Soft-delete a feature.

    * No polls on epoch N → flip ``is_active=FALSE`` in place.
    * Polls on epoch N, no ack → 409 (handled by the service).
    * Polls on epoch N, acknowledged → clone into N+1 SKIPPING this feature_key;
      the row at epoch N stays active and untouched (epoch N is frozen).

    Note the deliberate asymmetry: the *same* PM action produces opposite
    epoch-N states across the two success branches. That preserves the
    "epoch N is frozen once a poll lands on it" invariant from PRD FR8–11 —
    Story 2.7 Dev Notes (DELETE state asymmetry table) covers the read-side
    implications for downstream queries.
    """

    # Pre-flight: the feature must currently exist active at the project's
    # current_epoch. Otherwise the DELETE has no target → 404 before any
    # epoch-bump side effect runs.
    current_epoch = epoch_service.get_current_epoch(project_id)
    _ = _load_active_feature(project_id, current_epoch, feature_key)

    def mutation(epoch: int) -> None:
        # On Branch A (no polls), ``epoch == current_epoch`` and the feature
        # is still there — soft-delete it.
        # On Branch C (polls + ack), ``epoch == current_epoch + 1`` and the
        # feature was excluded from the clone — there's nothing to mutate.
        stmt = select(Feature).where(
            Feature.project_id == project_id,
            Feature.epoch == epoch,
            Feature.feature_key == feature_key,
            Feature.is_active.is_(True),
        )
        feature = db.session.execute(stmt).scalar_one_or_none()
        if feature is not None:
            feature.is_active = False

    epoch_service.bump_epoch_on_feature_change(
        project_id,
        mutation,
        acknowledged=_acknowledged(),
        exclude_feature_keys=frozenset({feature_key}),
    )

    return Response(status=204), 204


@features_bp.get("/epochs/<int:epoch>/features")
def list_features_at_epoch(project_id: UUID, epoch: int) -> tuple[Response, int]:
    """``GET /api/v1/projects/:id/epochs/:epoch/features`` — frozen historical set.

    Returns every feature row at the given epoch including soft-deleted
    ones. Story 2-12's `<EpochSelector>` and Epic 5's analysis page consume
    this to reconstruct what respondents saw.
    """

    features = feature_service.list_features_for_epoch(project_id, epoch)
    payload = [FeatureResponse.model_validate(f).model_dump(mode="json") for f in features]
    return jsonify(payload), 200
