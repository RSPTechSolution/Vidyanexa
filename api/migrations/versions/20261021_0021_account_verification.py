"""account verification

Revision ID: 0021
Revises: 0020
Create Date: 2026-10-21 10:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0021'
down_revision: str | None = '0020'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True))
    # Everyone who already has an account counts as verified: only new sign-ups are asked to confirm.
    op.execute("UPDATE users SET verified_at = COALESCE(last_login_at, created_at, now())")


def downgrade() -> None:
    op.drop_column('users', 'verified_at')
