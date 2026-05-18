# Sidebeat Lanes

오른쪽에서 왼쪽으로 노트가 이동하는 브라우저 리듬게임 프로토타입입니다.

## 현재 구현된 기초 기능

- Canvas 기반 4레인 횡스크롤 노트 렌더링
- Easy / Normal / Hard / Expert 난이도 선택
- 오른쪽 → 왼쪽 이동, 왼쪽 판정선에서 입력 판정
- `D F J K` 키 입력
- Perfect / Great / Good / Miss 판정
- 점수, 콤보, 정확도, 체력 UI
- Web Audio API 기반 간단한 내장 비트/메트로놈
- 시작, 일시정지, 재시작
- 곡 없이도 테스트 가능한 자동 생성 차트

## 실행

```bash
npm start
```

그 다음 브라우저에서 <http://localhost:5173> 을 엽니다.

정적 파일만으로 구성되어 있어 `public/index.html`을 직접 열어도 동작합니다.

## 조작

- 난이도 셀렉터: Easy / Normal / Hard / Expert 선택
- `Space`: 시작 / 일시정지
- `D F J K`: 1~4번 레인 입력
- `R`: 재시작

## 다음 개발 후보

- 실제 음원/JSON 차트 로딩
- 롱노트와 슬라이드 노트
- 실제 곡별 난이도 저장/해금
- 모바일 터치 입력
- 결과 화면 저장/공유
