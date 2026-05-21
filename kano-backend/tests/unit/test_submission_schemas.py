"""Unit tests for ``kano.schemas.submission``.

Pure Pydantic — no Flask, no DB. The Likert range (1-5) is locked at the
schema layer here; completeness-against-the-poll is Story 4.2's job and is
asserted there, not here.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from pydantic import ValidationError

from kano.schemas.submission import AnswerIn, PollSubmission


class TestAnswerIn:
    def test_accepts_valid_payload(self) -> None:
        answer = AnswerIn.model_validate(
            {"feature_key": uuid4(), "fq_answer": 3, "dq_answer": 2}
        )
        assert answer.fq_answer == 3
        assert answer.dq_answer == 2

    @pytest.mark.parametrize("bad_fq", [0, -1, 6, 100])
    def test_rejects_out_of_range_fq_answer(self, bad_fq: int) -> None:
        with pytest.raises(ValidationError):
            AnswerIn.model_validate(
                {"feature_key": uuid4(), "fq_answer": bad_fq, "dq_answer": 3}
            )

    @pytest.mark.parametrize("bad_dq", [0, -1, 6, 100])
    def test_rejects_out_of_range_dq_answer(self, bad_dq: int) -> None:
        with pytest.raises(ValidationError):
            AnswerIn.model_validate(
                {"feature_key": uuid4(), "fq_answer": 3, "dq_answer": bad_dq}
            )

    def test_coerces_string_digits_to_int(self) -> None:
        # Pydantic 2 default: numeric strings coerce. Pin this so any future
        # `strict=True` flip is a deliberate decision, not a silent regression.
        answer = AnswerIn.model_validate(
            {"feature_key": uuid4(), "fq_answer": "3", "dq_answer": "5"}
        )
        assert answer.fq_answer == 3
        assert answer.dq_answer == 5

    def test_rejects_non_numeric_string(self) -> None:
        with pytest.raises(ValidationError):
            AnswerIn.model_validate(
                {"feature_key": uuid4(), "fq_answer": "three", "dq_answer": 2}
            )

    def test_rejects_invalid_feature_key(self) -> None:
        with pytest.raises(ValidationError):
            AnswerIn.model_validate(
                {"feature_key": "not-a-uuid", "fq_answer": 3, "dq_answer": 2}
            )

    def test_rejects_missing_feature_key(self) -> None:
        with pytest.raises(ValidationError):
            AnswerIn.model_validate({"fq_answer": 3, "dq_answer": 2})

    def test_ignores_extra_unknown_keys(self) -> None:
        # Pydantic 2 default: extra keys are ignored. Pin this so a future
        # `model_config = ConfigDict(extra="forbid")` is a deliberate choice.
        answer = AnswerIn.model_validate(
            {
                "feature_key": uuid4(),
                "fq_answer": 3,
                "dq_answer": 2,
                "comment": "ignored",
            }
        )
        assert not hasattr(answer, "comment")

    def test_serializes_snake_case_keys(self) -> None:
        answer = AnswerIn(feature_key=uuid4(), fq_answer=4, dq_answer=2)
        assert set(answer.model_dump().keys()) == {"feature_key", "fq_answer", "dq_answer"}


class TestPollSubmission:
    def test_accepts_valid_payload(self) -> None:
        submission = PollSubmission.model_validate(
            {
                "answers": [
                    {"feature_key": uuid4(), "fq_answer": 3, "dq_answer": 2},
                    {"feature_key": uuid4(), "fq_answer": 5, "dq_answer": 1},
                ]
            }
        )
        assert len(submission.answers) == 2
        assert all(isinstance(a, AnswerIn) for a in submission.answers)

    def test_rejects_missing_answers_field(self) -> None:
        with pytest.raises(ValidationError):
            PollSubmission.model_validate({})

    def test_rejects_empty_answers_list(self) -> None:
        # min_length=1 — empty list is shape-valid JSON but semantically wrong;
        # catch it at the schema layer for a clean 400 (not a 422 from the
        # completeness check in Story 4.2).
        with pytest.raises(ValidationError):
            PollSubmission.model_validate({"answers": []})

    def test_rejects_answer_with_out_of_range_value(self) -> None:
        # Validation bubbles up from the nested AnswerIn schema.
        with pytest.raises(ValidationError):
            PollSubmission.model_validate(
                {
                    "answers": [
                        {"feature_key": uuid4(), "fq_answer": 7, "dq_answer": 2},
                    ]
                }
            )

    def test_no_field_alias_anywhere(self) -> None:
        # Architecture §Format Patterns: snake_case end-to-end, no Field(alias=...).
        for field_name, field_info in PollSubmission.model_fields.items():
            assert field_info.alias is None, (
                f"PollSubmission.{field_name} has an alias; wire must stay snake_case"
            )
        for field_name, field_info in AnswerIn.model_fields.items():
            assert field_info.alias is None, (
                f"AnswerIn.{field_name} has an alias; wire must stay snake_case"
            )
