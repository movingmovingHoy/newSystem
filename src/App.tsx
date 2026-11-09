import { JourneyApp } from './ui/components/JourneyApp'
import { createDemoJourneyService, isDemoMode } from './ui/services/demo'

// 데모 모드(npm run demo)면 API 키 없이 샘플 데이터 서비스로 동작한다.
const demo = isDemoMode()
const demoService = demo ? createDemoJourneyService() : undefined

export default function App() {
  return <JourneyApp service={demoService} demo={demo} />
}
