import type { Generated } from "kysely";
export interface Database {
  users: {
    id: Generated<number>;
    public_id: string;
    code: string;
    name: string;
    role: string;
    kind: string;
    active: Generated<boolean>;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
    created_by: string;
    updated_by: string;
    deleted_at: Date | null;
    deleted_by: string | null;
  };
}
