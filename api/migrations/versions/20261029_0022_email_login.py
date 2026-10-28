"""email-only sign-in, one class per class teacher, account closure requests

Revision ID: 0022
Revises: 0021
Create Date: 2026-10-29 10:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db import rls

revision: str = '0022'
down_revision: str | None = '0021'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # One active account per email across the platform (sign-in is by email alone). Where two schools already share an
    # email, the account used most recently stays active and the others are deactivated.
    op.execute("""
        UPDATE users SET is_active = false FROM (
            SELECT id, row_number() OVER (PARTITION BY email ORDER BY last_login_at DESC NULLS LAST, created_at DESC) AS n
            FROM users WHERE deleted_at IS NULL AND is_active
        ) ranked WHERE users.id = ranked.id AND ranked.n > 1
    """)
    op.create_index('uq_users_active_email', 'users', ['email'], unique=True,
                    postgresql_where=sa.text('deleted_at IS NULL AND is_active'))

    # A class teacher is in charge of one section. Where a teacher had several, they keep the first and the others are
    # left without a class teacher for the school to assign.
    op.execute("""
        UPDATE sections SET class_teacher_id = NULL FROM (
            SELECT s.id, row_number() OVER (PARTITION BY s.class_teacher_id ORDER BY c.sort_order, c.name, s.name) AS n
            FROM sections s JOIN classes c ON c.id = s.class_id WHERE s.class_teacher_id IS NOT NULL
        ) ranked WHERE sections.id = ranked.id AND ranked.n > 1
    """)
    op.create_index('uq_section_class_teacher', 'sections', ['class_teacher_id'], unique=True,
                    postgresql_where=sa.text('class_teacher_id IS NOT NULL'))

    # Hostel and CCTV are in preview (switched on per school by the platform), so the Max plan no longer lists them.
    op.execute("""
        UPDATE plans SET features = (
            SELECT jsonb_agg(CASE WHEN f = 'Hostel, inventory, gate security and CCTV' THEN 'Inventory and gate security' ELSE f END)
            FROM jsonb_array_elements_text(features) AS f
        ) WHERE features @> '["Hostel, inventory, gate security and CCTV"]'::jsonb
    """)

    op.create_table('account_requests',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('requested_by', sa.UUID(), nullable=True),
        sa.Column('student_ids', postgresql.ARRAY(sa.UUID()), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('decided_by', sa.UUID(), nullable=True),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('decision_note', sa.String(length=300), nullable=True),
        sa.Column('school_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['requested_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['decided_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['school_id'], ['schools.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_account_requests_school_id'), 'account_requests', ['school_id'])
    op.create_index(op.f('ix_account_requests_requested_by'), 'account_requests', ['requested_by'])
    op.create_index(op.f('ix_account_requests_status'), 'account_requests', ['status'])
    rls.enable_tenant_rls('account_requests')


def downgrade() -> None:
    rls.disable_rls('account_requests')
    op.drop_table('account_requests')
    op.drop_index('uq_section_class_teacher', table_name='sections')
    op.drop_index('uq_users_active_email', table_name='users')
