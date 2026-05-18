# Sidebeat Lanes

오른쪽에서 왼쪽으로 노트가 이동하는 브라우저 리듬게임/채보 제작 스튜디오 프로토타입입니다.

## 현재 구현된 기능

- Canvas 기반 4레인 횡스크롤 리듬게임
- Easy / Normal / Hard / Expert 난이도
- 탭 노트 + 롱노트 판정
- Perfect / Great / Good / Miss 판정
- 점수, 콤보, 정확도, 체력 UI
- 히트 이펙트와 롱노트 홀드 표시
- 결과 화면: 랭크, 점수, 최대 콤보, 정확도, 노트 수
- 오디오 파일 업로드 기반 커스텀 채보 에디터
- BPM / 오프셋 / 스냅 기준 박자 그리드
- 타임라인 클릭/드래그로 노트 추가·이동
- JSON 채보 내보내기/불러오기/다운로드
- 로컬 곡/채보 라이브러리 저장
- 메트로놈 기반 레이턴시 체크 및 판정 보정

## 실행

```bash
npm start
```

그 다음 브라우저에서 <http://localhost:5173> 을 엽니다.

정적 파일만으로 구성되어 있어 `public/index.html`을 직접 열어도 동작합니다.

## 조작

- `Space`: 시작 / 일시정지
- `D F J K`: 1~4번 레인 입력
- 롱노트: 해당 키를 누른 채 끝까지 유지
- `R`: 재시작
- 타임라인 클릭: 현재 스냅 기준으로 노트 추가
- 타임라인 드래그: 노트 시간/레인 이동
- `Shift + 타임라인 클릭`: 롱노트 추가

## 채보 시스템

채보 JSON 형식은 `sidebeat-lanes-chart-v2`입니다.

```json
{
  "title": "Example Song",
  "format": "sidebeat-lanes-chart-v2",
  "difficulty": "normal",
  "bpm": 128,
  "offset": 0,
  "latencyMs": 0,
  "audioFileName": "example.mp3",
  "notes": [
    { "lane": 0, "time": 1200, "duration": 0 },
    { "lane": 2, "time": 2400, "duration": 900 }
  ]
}
```

브라우저 보안상 로컬 오디오 파일 자체는 영구 저장하지 않고, 채보와 오디오 파일명 메타데이터를 로컬 라이브러리에 저장합니다.

## 다음 개발 후보

- IndexedDB 기반 오디오 파일 영구 저장
- 곡 패키지(zip) 가져오기/내보내기
- 롱노트 끝점 드래그 편집
- 모바일 터치 입력
- 온라인 랭킹/계정 시스템
