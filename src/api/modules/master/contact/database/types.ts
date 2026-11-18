import type { Generated } from "kysely";
export interface Database {
  contacts: {
    id: Generated<number>;
    public_id: string;
    name: string;
    mobile: string;
    active: Generated<boolean>;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
    created_by: string;
    updated_by: string;
    deleted_at: Date | null;
    deleted_by: string | null;
  };
}
