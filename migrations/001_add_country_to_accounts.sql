-- Add country column to accounts table
ALTER TABLE accounts ADD COLUMN country VARCHAR(10) DEFAULT NULL;
CREATE INDEX idx_accounts_country ON accounts(country);

-- Comment on the new column
COMMENT ON COLUMN accounts.country IS 'Streamer country/region: TH, VN, PH, MY, US, SG, ID';
