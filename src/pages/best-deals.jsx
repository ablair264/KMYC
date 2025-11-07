import BestDeals from '../components/BestDeals';

export function BestDealsPage() {
  const handleError = (errorMessage) => {
    console.error('Best Deals Error:', errorMessage);
    // Could show toast or other error handling
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Best Deals</h1>
        <p className="text-muted-foreground">
          Browse the best vehicle lease deals across all providers.
        </p>
      </div>
      
      <BestDeals onError={handleError} />
    </div>
  )
}