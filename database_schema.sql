-- Supabase Database Schema for Vehicle Lease Analyzer
-- Run this in your Supabase SQL editor to set up the database

-- Enable Row Level Security
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Create vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cap_code TEXT UNIQUE,
    manufacturer TEXT NOT NULL,
    model TEXT NOT NULL,
    variant TEXT,
    p11d DECIMAL(10,2),
    otr_price DECIMAL(10,2),
    fuel_type TEXT,
    co2_emissions INTEGER,
    mpg DECIMAL(5,1),
    electric_range INTEGER,
    body_style TEXT,
    transmission TEXT,
    euro_rating INTEGER,
    insurance_group INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create provider_mappings table for storing column mappings
CREATE TABLE IF NOT EXISTS provider_mappings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    provider_name TEXT UNIQUE NOT NULL,
    column_mappings JSONB NOT NULL,
    file_format TEXT DEFAULT 'csv',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create pricing_data table for storing all pricing information
CREATE TABLE IF NOT EXISTS pricing_data (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
    provider_name TEXT NOT NULL,
    monthly_rental DECIMAL(8,2) NOT NULL,
    term_months INTEGER,
    annual_mileage INTEGER,
    upfront_payment DECIMAL(8,2),
    excess_mileage_rate DECIMAL(5,3),
    payment_plan TEXT,
    contract_type TEXT,
    score DECIMAL(5,2),
    score_category TEXT,
    upload_batch_id UUID,
    file_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Composite index for efficient querying
    UNIQUE(vehicle_id, provider_name, monthly_rental, term_months, annual_mileage)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_vehicles_cap_code ON vehicles(cap_code);
CREATE INDEX IF NOT EXISTS idx_vehicles_manufacturer ON vehicles(manufacturer);
CREATE INDEX IF NOT EXISTS idx_vehicles_p11d ON vehicles(p11d);
CREATE INDEX IF NOT EXISTS idx_vehicles_fuel_type ON vehicles(fuel_type);

CREATE INDEX IF NOT EXISTS idx_pricing_vehicle_id ON pricing_data(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_pricing_provider ON pricing_data(provider_name);
CREATE INDEX IF NOT EXISTS idx_pricing_score ON pricing_data(score DESC);
CREATE INDEX IF NOT EXISTS idx_pricing_monthly ON pricing_data(monthly_rental);

-- Create a view for best pricing across all providers
CREATE OR REPLACE VIEW best_pricing_view AS
WITH ranked_pricing AS (
    SELECT 
        p.*,
        v.cap_code,
        v.manufacturer,
        v.model,
        v.variant,
        v.p11d,
        v.fuel_type,
        v.co2_emissions,
        v.mpg,
        v.electric_range,
        v.body_style,
        v.insurance_group,
        ROW_NUMBER() OVER (
            PARTITION BY v.id 
            ORDER BY p.monthly_rental ASC, p.score DESC
        ) as price_rank
    FROM pricing_data p
    JOIN vehicles v ON p.vehicle_id = v.id
    WHERE p.monthly_rental > 0
)
SELECT 
    vehicle_id,
    cap_code,
    manufacturer,
    model,
    variant,
    p11d,
    fuel_type,
    co2_emissions,
    mpg,
    electric_range,
    body_style,
    insurance_group,
    monthly_rental as best_monthly_rental,
    provider_name as best_provider,
    term_months,
    annual_mileage,
    upfront_payment,
    score,
    score_category,
    created_at as best_price_date
FROM ranked_pricing 
WHERE price_rank = 1;

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE OR REPLACE TRIGGER update_vehicles_updated_at 
    BEFORE UPDATE ON vehicles 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_provider_mappings_updated_at 
    BEFORE UPDATE ON provider_mappings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to find similar vehicles for matching
CREATE OR REPLACE FUNCTION find_similar_vehicles(
    search_manufacturer TEXT,
    search_p11d DECIMAL,
    search_model TEXT DEFAULT '',
    tolerance_percent DECIMAL DEFAULT 0.02
)
RETURNS TABLE (
    id UUID,
    cap_code TEXT,
    manufacturer TEXT,
    model TEXT,
    p11d DECIMAL,
    similarity_score DECIMAL
) AS $$
DECLARE
    p11d_tolerance DECIMAL;
BEGIN
    p11d_tolerance := search_p11d * tolerance_percent;
    
    RETURN QUERY
    SELECT 
        v.id,
        v.cap_code,
        v.manufacturer,
        v.model,
        v.p11d,
        -- Simple similarity based on string length and character overlap
        CASE 
            WHEN search_model = '' THEN 0.5
            ELSE 1.0 - (LENGTH(search_model) + LENGTH(v.model) - 2 * LENGTH(REGEXP_REPLACE(LOWER(search_model), LOWER(v.model), '', 'g'))) / GREATEST(LENGTH(search_model), LENGTH(v.model))::DECIMAL
        END as similarity_score
    FROM vehicles v
    WHERE v.manufacturer = search_manufacturer
        AND v.p11d BETWEEN (search_p11d - p11d_tolerance) AND (search_p11d + p11d_tolerance)
    ORDER BY similarity_score DESC, ABS(v.p11d - search_p11d) ASC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Function to get pricing statistics
CREATE OR REPLACE FUNCTION get_pricing_stats()
RETURNS TABLE (
    total_vehicles BIGINT,
    total_pricing_records BIGINT,
    unique_providers BIGINT,
    avg_monthly_rental DECIMAL,
    lowest_monthly_rental DECIMAL,
    highest_monthly_rental DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM vehicles)::BIGINT,
        (SELECT COUNT(*) FROM pricing_data)::BIGINT,
        (SELECT COUNT(DISTINCT provider_name) FROM pricing_data)::BIGINT,
        (SELECT AVG(monthly_rental) FROM pricing_data WHERE monthly_rental > 0),
        (SELECT MIN(monthly_rental) FROM pricing_data WHERE monthly_rental > 0),
        (SELECT MAX(monthly_rental) FROM pricing_data WHERE monthly_rental > 0);
END;
$$ LANGUAGE plpgsql;

-- Enable RLS (Row Level Security) if needed
-- ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE pricing_data ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE provider_mappings ENABLE ROW LEVEL SECURITY;

-- Basic policies (uncomment if you want to restrict access)
-- CREATE POLICY "Anyone can read vehicles" ON vehicles FOR SELECT USING (true);
-- CREATE POLICY "Anyone can read pricing_data" ON pricing_data FOR SELECT USING (true);

-- Sample data for testing (optional)
-- INSERT INTO vehicles (cap_code, manufacturer, model, variant, p11d, fuel_type, co2_emissions, mpg) VALUES
-- ('BMW001', 'BMW', '3 Series', '320d SE 4dr Auto', 35000.00, 'Diesel', 120, 55.4),
-- ('AUD001', 'AUDI', 'A4', 'A4 2.0 TDI 150 SE 4dr', 32000.00, 'Diesel', 115, 58.9),
-- ('MER001', 'MERCEDES', 'C-Class', 'C220d SE 4dr Auto', 38000.00, 'Diesel', 125, 52.3);

COMMENT ON TABLE vehicles IS 'Master table of all vehicles with specifications';
COMMENT ON TABLE pricing_data IS 'Pricing information from different providers';
COMMENT ON TABLE provider_mappings IS 'Saved column mappings for different providers';
COMMENT ON VIEW best_pricing_view IS 'View showing the best available price for each vehicle';
COMMENT ON FUNCTION find_similar_vehicles IS 'Function to find vehicles similar to given criteria for matching';
COMMENT ON FUNCTION get_pricing_stats IS 'Function to get overall database statistics';