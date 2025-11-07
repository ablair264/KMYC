import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

// Check if Supabase is properly configured
const isSupabaseConfigured = supabaseUrl && supabaseAnonKey && 
  supabaseUrl !== 'your_supabase_url_here' && 
  supabaseAnonKey !== 'your_supabase_anon_key_here' &&
  supabaseUrl.startsWith('http')

// Initialize Supabase client only if properly configured
export const supabase = isSupabaseConfigured ? 
  createClient(supabaseUrl, supabaseAnonKey) : null

// Export configuration status
export const isConfigured = isSupabaseConfigured

// Database functions for vehicle data management

/**
 * Insert or update vehicle data
 */
export const upsertVehicle = async (vehicleData) => {
  if (!supabase) {
    throw new Error('Database not configured')
  }

  const { data, error } = await supabase
    .from('vehicles')
    .upsert(vehicleData, {
      onConflict: 'cap_code',
      ignoreDuplicates: false
    })
    .select()

  if (error) throw error
  return data
}

/**
 * Insert or update pricing data for a vehicle
 */
export const insertPricingData = async (pricingData) => {
  if (!supabase) {
    throw new Error('Database not configured')
  }

  const { data, error } = await supabase
    .from('pricing_data')
    .upsert(pricingData, {
      onConflict: 'vehicle_id,provider_name,monthly_rental,term_months,annual_mileage',
      ignoreDuplicates: false
    })
    .select()

  if (error) throw error
  return data
}

/**
 * Get best pricing for each vehicle
 */
export const getBestPricing = async (filters = {}) => {
  let query = supabase
    .from('best_pricing_view')
    .select('*')
    .order('score', { ascending: false })

  // Apply filters
  if (filters.manufacturer) {
    query = query.eq('manufacturer', filters.manufacturer)
  }
  
  if (filters.fuelType) {
    query = query.eq('fuel_type', filters.fuelType)
  }
  
  if (filters.maxMonthly) {
    query = query.lte('best_monthly_rental', filters.maxMonthly)
  }

  if (filters.minScore) {
    query = query.gte('score', filters.minScore)
  }

  const { data, error } = await query.limit(1000)

  if (error) throw error
  return data
}

/**
 * Search vehicles with fuzzy matching
 */
export const searchVehicles = async (searchTerm) => {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .or(`manufacturer.ilike.%${searchTerm}%,model.ilike.%${searchTerm}%`)
    .limit(50)

  if (error) throw error
  return data
}

/**
 * Get pricing history for a specific vehicle
 */
export const getPricingHistory = async (vehicleId) => {
  const { data, error } = await supabase
    .from('pricing_data')
    .select(`
      *,
      provider_mappings(provider_name)
    `)
    .eq('vehicle_id', vehicleId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

/**
 * Save provider column mapping for reuse
 */
export const saveProviderMapping = async (mappingData) => {
  const { data, error } = await supabase
    .from('provider_mappings')
    .upsert({
      provider_name: mappingData.providerName,
      column_mappings: mappingData.mappings,
      file_format: mappingData.fileFormat || 'csv'
    }, {
      onConflict: 'provider_name'
    })
    .select()

  if (error) throw error
  return data
}

/**
 * Get saved provider mappings
 */
export const getProviderMappings = async () => {
  const { data, error } = await supabase
    .from('provider_mappings')
    .select('*')
    .order('provider_name')

  if (error) throw error
  return data
}

/**
 * Match vehicle by various criteria
 */
export const findMatchingVehicle = async (vehicleData) => {
  if (!supabase) {
    throw new Error('Database not configured')
  }

  // First try exact CAP code match
  if (vehicleData.cap_code) {
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('cap_code', vehicleData.cap_code)
        .maybeSingle()
      
      if (error && error.code !== 'PGRST116') {
        console.warn('CAP code search error:', error)
      }
      if (data) return data
    } catch (error) {
      console.warn('CAP code search failed:', error)
    }
  }

  // Try P11D + manufacturer + fuzzy model match
  if (vehicleData.p11d && vehicleData.manufacturer) {
    try {
      const p11dValue = parseFloat(vehicleData.p11d)
      const p11dTolerance = p11dValue * 0.02 // 2% tolerance
      const minP11d = Math.round((p11dValue - p11dTolerance) * 100) / 100
      const maxP11d = Math.round((p11dValue + p11dTolerance) * 100) / 100
      
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('manufacturer', vehicleData.manufacturer.toUpperCase())
        .gte('p11d', minP11d)
        .lte('p11d', maxP11d)
        .limit(10)

      if (error) {
        console.warn('P11D search error:', error)
        return null
      }

      if (data && data.length > 0) {
        // Find best model match using simple string similarity
        const modelMatches = data.map(vehicle => ({
          ...vehicle,
          similarity: calculateStringSimilarity(vehicleData.model || '', vehicle.model || '')
        })).sort((a, b) => b.similarity - a.similarity)

        if (modelMatches[0].similarity > 0.7) {
          return modelMatches[0]
        }
      }
    } catch (error) {
      console.warn('P11D search failed:', error)
    }
  }

  return null
}

/**
 * Simple string similarity calculation
 */
const calculateStringSimilarity = (str1, str2) => {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1
  
  if (longer.length === 0) return 1.0

  const editDistance = levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase())
  return (longer.length - editDistance) / longer.length
}

/**
 * Levenshtein distance calculation
 */
const levenshteinDistance = (str1, str2) => {
  const matrix = []

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }

  return matrix[str2.length][str1.length]
}