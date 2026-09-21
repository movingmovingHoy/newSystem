import { DevPlanCheck } from './ui/DevPlanCheck'

/**
 * 앱 루트. [뼈대] 단계에서는 플레이스홀더 화면만 둔다.
 * 실제 입력/주차선택/결과 화면은 ui/components 에서 [B 담당]이 구현한다.
 *
 * ⚠️ DevPlanCheck 는 A 담당 경로 플래너를 눈으로 확인하기 위한 임시 코드다.
 *    정식 UI가 붙으면 import 와 사용처, 그리고 파일을 삭제한다.
 */
export default function App() {
  return (
    <main
      style={{
        fontFamily: 'var(--font-sans)',
        color: 'var(--color-text)',
        padding: 'var(--space-4)',
      }}
    >
      <h1>서울 길찾기</h1>
      <p>자차 / 혼합 / 대중교통 경로 비교 서비스 (뼈대)</p>
      <DevPlanCheck />
    </main>
  )
}
