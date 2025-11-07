import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from './components/layout/dashboard-layout';
import { DashboardPage } from './pages/dashboard';
import { UploadPage } from './pages/upload';
import { BestDealsPage } from './pages/best-deals';

function App() {
  return (
    <BrowserRouter>
      <DashboardLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/best-deals" element={<BestDealsPage />} />
          <Route path="/analytics" element={
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
                <p className="text-muted-foreground">
                  Detailed analytics and insights from your lease data.
                </p>
              </div>
              <div className="text-center py-12 text-muted-foreground">
                <p>Analytics page coming soon...</p>
              </div>
            </div>
          } />
          <Route path="/vehicles" element={
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Vehicles</h1>
                <p className="text-muted-foreground">
                  Browse and manage vehicle data.
                </p>
              </div>
              <div className="text-center py-12 text-muted-foreground">
                <p>Vehicle management page coming soon...</p>
              </div>
            </div>
          } />
          <Route path="/database" element={
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Database</h1>
                <p className="text-muted-foreground">
                  Database management and configuration.
                </p>
              </div>
              <div className="text-center py-12 text-muted-foreground">
                <p>Database management page coming soon...</p>
              </div>
            </div>
          } />
          <Route path="/settings" element={
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground">
                  Application settings and preferences.
                </p>
              </div>
              <div className="text-center py-12 text-muted-foreground">
                <p>Settings page coming soon...</p>
              </div>
            </div>
          } />
        </Routes>
      </DashboardLayout>
    </BrowserRouter>
  );
}

export default App;