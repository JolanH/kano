"""Declarative base, shared ``MetaData``, and Flask-SQLAlchemy extension.

The naming convention here drives every constraint and index name produced by
SQLAlchemy and Alembic, so the migration body and the running database stay
deterministic across environments.

The module-level ``db`` is a Flask-SQLAlchemy instance bound to our explicit
:class:`Base` so model classes that import ``Base`` share metadata with the
extension's session/engine plumbing. ``create_app`` calls ``db.init_app(app)``
to attach the engine; views obtain a session via ``db.session``.
"""

from __future__ import annotations

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

NAMING_CONVENTION: dict[str, str] = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_N_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

metadata = MetaData(naming_convention=NAMING_CONVENTION)


class Base(DeclarativeBase):
    """Project-wide declarative base bound to the shared ``metadata``."""

    metadata = metadata


db = SQLAlchemy(model_class=Base)


__all__ = ["Base", "NAMING_CONVENTION", "db", "metadata"]
