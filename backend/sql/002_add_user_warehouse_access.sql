CREATE TABLE user_warehouse_access (
  user_id NUMBER PRIMARY KEY,
  company_id NUMBER NOT NULL,
  warehouse_id NUMBER NOT NULL,
  created_at TIMESTAMP(6) DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT user_warehouse_user_fk FOREIGN KEY (user_id)
    REFERENCES app_users (user_id),
  CONSTRAINT user_warehouse_company_fk FOREIGN KEY (company_id)
    REFERENCES companies (company_id),
  CONSTRAINT user_warehouse_warehouse_fk FOREIGN KEY (warehouse_id)
    REFERENCES warehouses (warehouse_id)
);

CREATE INDEX user_warehouse_company_ix ON user_warehouse_access (company_id);
CREATE INDEX user_warehouse_warehouse_ix ON user_warehouse_access (warehouse_id);
