"""Domain exception hierarchy.

Every Kano domain error is a subclass of :class:`KanoError` so the API error
handler in ``kano.api.errors`` can register one well-typed handler per
exception type and emit RFC 7807 ``application/problem+json`` responses with
a stable ``type`` URL slug + HTTP status code.

Each subclass is a placeholder shell here; downstream stories (Epic 2+) raise
them with concrete ``detail`` messages from service-layer code.
"""

from __future__ import annotations


class KanoError(Exception):
    """Base for all Kano domain exceptions."""

    status_code: int = 500
    type_slug: str = "internal-server-error"
    title: str = "Internal Server Error"


# noqa: N818 — class names are the canonical domain terms locked in the
# Story 1.3 spec ("EpochBumpRequired", "PollExpired", etc.). The "Error" suffix
# convention is intentionally suppressed here so the names match the
# Problem-Details ``type`` slugs and the architecture document verbatim.


class EpochBumpRequired(KanoError):  # noqa: N818
    """Raised when a feature mutation needs an epoch bump first.

    Carries ``project_id``, ``current_epoch``, and ``would_be_epoch`` so the
    API layer can surface them in the 409 Problem Details body — the PM SPA
    then shows the two-register confirmation dialog (Story 2-11).
    """

    status_code = 409
    type_slug = "epoch-bump-required"
    title = "Feature change requires epoch bump"

    def __init__(
        self,
        *,
        project_id: object,
        current_epoch: int,
        would_be_epoch: int,
        detail: str | None = None,
    ) -> None:
        self.project_id = project_id
        self.current_epoch = current_epoch
        self.would_be_epoch = would_be_epoch
        super().__init__(
            detail
            or (
                f"Project {project_id} has polls at epoch {current_epoch}; "
                f"mutation must bump to epoch {would_be_epoch}"
            )
        )


class PollExpired(KanoError):  # noqa: N818
    """Raised when a public poll-submission lands after ``expires_at``."""

    status_code = 409
    type_slug = "poll-expired"
    title = "Poll has expired"


class PartialSubmission(KanoError):  # noqa: N818
    """Raised when a respondent submission is missing required answers."""

    status_code = 422
    type_slug = "partial-submission"
    title = "Submission is missing required answers"


class EntityNotFound(KanoError):  # noqa: N818
    """Raised when a requested project/feature/poll cannot be found."""

    status_code = 404
    type_slug = "entity-not-found"
    title = "Entity not found"


__all__ = [
    "EntityNotFound",
    "EpochBumpRequired",
    "KanoError",
    "PartialSubmission",
    "PollExpired",
]
