# Sidebeat Lanes

오른쪽에서 왼쪽으로 노트가 이동하는 브라우저 리듬게임과 관리자용 채보 제작 스튜디오입니다.

## 화면 분리

- 플레이어 메인 UI: <http://localhost:5173/>
- 관리자 채보 스튜디오: <http://localhost:5173/admin.html>

메인 UI는 게임 플레이에만 집중합니다. 곡 업로드, 채보 편집, Python 자동 채보 결과 불러오기, 라이브러리 관리는 관리자 스튜디오에서 합니다.

## 실행

```bash
npm install
npm start
```

## 빌드/검증

```bash
npm test
```

`npm test`는 스모크 테스트와 TypeScript/Vite 빌드를 함께 실행합니다.

## TypeScript 모듈 구조

```txt
src/
  main.ts              # 플레이 전용 진입점
  admin.ts             # 관리자 스튜디오 진입점
  core/
    types.ts           # 채보 포맷/게임 타입
    chart.ts           # 채보 파싱/정규화/데모 채보
    judgement.ts       # 판정/랭크
  game/
    GameApp.ts         # 플레이 엔진/렌더링/입력
  library/
    storage.ts         # 로컬 채보 라이브러리
  ui/
    dom.ts             # DOM 헬퍼
```

## 채보 포맷

현재 표준 포맷은 `sidebeat-lanes-chart-v3`입니다.

```json
{
  "title": "Example Song",
  "format": "sidebeat-lanes-chart-v3",
  "difficulty": "normal",
  "bpm": 128,
  "offset": 0,
  "latencyMs": 0,
  "audioFileName": "example.mp3",
  "generator": "tools/chartgen/generate_chart.py",
  "notes": [
    { "lane": 0, "time": 1200, "duration": 0 },
    { "lane": 2, "time": 2400, "duration": 900 }
  ]
}
```

- `lane`: 0~3 (`D/F/J/K`)
- `time`: 노트 시작 시각(ms)
- `duration`: 0이면 탭 노트, 0보다 크면 롱노트(ms)

## Python 자동 채보/BPM 감지

Python 도구는 브라우저와 분리된 로컬 CLI입니다. BPM 감지와 onset 기반 노트 초안을 생성합니다.

```bash
python -m venv .venv-chartgen
source .venv-chartgen/bin/activate
pip install -r tools/chartgen/requirements.txt
python tools/chartgen/generate_chart.py song.mp3 --difficulty hard --out examples/charts/song-hard.json
```

생성된 JSON은 `/admin.html`의 “생성된 JSON 불러오기”에서 불러와 타임라인으로 수정할 수 있습니다.

자동 채보는 완성본이 아니라 초안 생성기입니다. 최종 재미는 관리자 스튜디오에서 다듬는 흐름을 전제로 합니다.

## 현재 구현된 기능

- Canvas 기반 4레인 횡스크롤 리듬게임
- 탭 노트 + 롱노트
- 결과 화면
- 히트 이펙트
- TypeScript 모듈화
- 관리자용 채보 편집기 분리
- BPM/오프셋/스냅 기반 타임라인
- JSON 채보 내보내기/불러오기
- 로컬 채보 라이브러리
- Python `librosa` 기반 BPM 감지 + 자동 채보 초안 생성

## 다음 개발 후보

- IndexedDB 기반 오디오 파일 영구 저장
- 곡 패키지(zip) 가져오기/내보내기
- Python chartgen을 서버 API로 감싸 관리자 페이지에서 직접 실행
- WebGL/WASM 렌더러 실험
