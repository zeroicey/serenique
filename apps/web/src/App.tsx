import { AppProviders } from '@/app/providers'
import { AppRouter } from '@/app/router'
import { ReloadPrompt } from '@/components/common/reload-prompt'

export default function App() {
  return (
    <AppProviders>
      <AppRouter />
      <ReloadPrompt />
    </AppProviders>
  )
}
