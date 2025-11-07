import { Car } from 'lucide-react'

export function RecentDeals() {
  const recentDeals = [
    {
      id: 1,
      manufacturer: "BMW",
      model: "3 Series 320i M Sport",
      provider: "ALD",
      monthlyRate: "£425.50",
      score: 95,
      savings: "£125/mo"
    },
    {
      id: 2, 
      manufacturer: "Audi",
      model: "A4 35 TFSI S Line",
      provider: "Lex",
      monthlyRate: "£389.99",
      score: 92,
      savings: "£98/mo"
    },
    {
      id: 3,
      manufacturer: "Mercedes",
      model: "C-Class C180 AMG Line",
      provider: "Fleet",
      monthlyRate: "£465.00",
      score: 88,
      savings: "£76/mo"
    },
    {
      id: 4,
      manufacturer: "Tesla",
      model: "Model 3 Long Range",
      provider: "Novated",
      monthlyRate: "£567.50",
      score: 85,
      savings: "£112/mo"
    },
    {
      id: 5,
      manufacturer: "Volvo",
      model: "XC40 T4 R-Design",
      provider: "ALD",
      monthlyRate: "£398.00",
      score: 91,
      savings: "£87/mo"
    }
  ]

  const getScoreColor = (score) => {
    if (score >= 90) return "text-green-600"
    if (score >= 80) return "text-blue-600"
    if (score >= 70) return "text-yellow-600"
    return "text-red-600"
  }

  return (
    <div className='space-y-8'>
      {recentDeals.map((deal) => (
        <div key={deal.id} className='flex items-center gap-4'>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <Car className="h-4 w-4" />
          </div>
          <div className='flex flex-1 flex-wrap items-center justify-between gap-2'>
            <div className='space-y-1 min-w-0 flex-1'>
              <p className='text-sm leading-none font-medium truncate'>
                {deal.manufacturer} {deal.model}
              </p>
              <p className='text-muted-foreground text-sm'>
                {deal.provider} • Score: <span className={getScoreColor(deal.score)}>{deal.score}</span>
              </p>
            </div>
            <div className='text-right'>
              <div className='font-medium'>{deal.monthlyRate}</div>
              <div className='text-xs text-green-600'>Save {deal.savings}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}