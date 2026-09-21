import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // .env* 에서 환경변수를 읽는다. REST 키는 서버(프록시)에서만 쓰고
  // 브라우저 번들에는 절대 포함하지 않는다 (VITE_ 접두사가 없으므로 노출 안 됨).
  const env = loadEnv(mode, process.cwd(), '')
  const kakaoRestKey = env.KAKAO_REST_API_KEY ?? ''
  const seoulKey = env.SEOUL_CITYDATA_KEY ?? ''

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
        '@features': fileURLToPath(new URL('./src/features', import.meta.url)),
        '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      },
    },
    server: {
      // 카카오에 등록한 주소(http://localhost:5173)가 흔들리지 않도록 포트 고정.
      // 포트가 사용 중이면 다른 포트로 넘어가지 않고 에러를 낸다.
      port: 5173,
      strictPort: true,
      // 개발용 프록시: 브라우저 → Vite → 카카오. CORS 회피 + REST 키 미노출.
      // 프론트는 절대 카카오를 직접 부르지 않고 아래 경로만 호출한다 (AGENTS.md 5, 17장).
      proxy: {
        // 로컬(장소검색/좌표변환), 대중교통·도보 등 dapi 계열
        '/api/kakao/dapi': {
          target: 'https://dapi.kakao.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/kakao\/dapi/, ''),
          headers: kakaoRestKey
            ? { Authorization: `KakaoAK ${kakaoRestKey}` }
            : undefined,
        },
        // 카카오모빌리티 자차 길찾기
        '/api/kakao/navi': {
          target: 'https://apis-navi.kakaomobility.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/kakao\/navi/, ''),
          headers: kakaoRestKey
            ? { Authorization: `KakaoAK ${kakaoRestKey}` }
            : undefined,
        },
        // 서울 실시간 도시데이터. 인증키가 URL 경로에 들어가므로 rewrite로 삽입한다.
        // 프론트: /api/seoul/citydata_ppltn/1/5/{장소명}
        //   → http://openapi.seoul.go.kr:8088/{KEY}/xml/citydata_ppltn/1/5/{장소명}
        '/api/seoul': {
          target: 'http://openapi.seoul.go.kr:8088',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/seoul/, `/${seoulKey}/xml`),
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  }
})
