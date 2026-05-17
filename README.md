# Rhythm4G Online

서버 없이 GitHub Pages에서 동작하는 Rhythm4G 정적 웹 버전입니다.

## 핵심 동작

- GitHub repo에 이미 올라간 `music/`, `charts/` 파일은 `manifest.json`을 통해 자동으로 곡 목록에 표시됩니다.
- 사용자가 개인 PC/모바일에서 직접 고르는 로컬 JSON/음악 파일은 별도 로컬 플레이 영역에서 처리합니다.
- 별도의 "같은 디렉토리에서 가져오기" 입력 UI는 없습니다.
- MP3 자동 분석 서버는 포함하지 않습니다. 채보 JSON은 PC판 Rhythm4G에서 만들어서 업로드하는 흐름을 기준으로 합니다.

## 파일 구조

```text
music/
  Song A.mp3
charts/
  Song A.easy.json
  Song A.normal.json
  Song A.hard.json
  Song A.extreme.json
  Song A.master.json
```

채보 JSON 내부에 `title`, `difficulty`, `tempo_bpm`, `duration`, `audio_path`, `notes`가 있으면 가장 잘 매칭됩니다.
`audio_path`가 없으면 chart 파일명/곡 제목과 music 파일명을 비교해 자동 매칭합니다.

## 로컬 테스트

```bash
python scripts/generate_manifest.py
python -m http.server 8000
```

브라우저에서 열기:

```text
http://localhost:8000
```

## GitHub Pages 배포

1. 이 폴더 전체를 GitHub repo에 push합니다.
2. repo의 `music/`, `charts/`에 곡과 채보를 추가합니다.
3. GitHub에서 `Settings → Pages → Build and deployment → Source: GitHub Actions`로 설정합니다.
4. push할 때마다 GitHub Actions가 `manifest.json`을 생성하고 Pages에 배포합니다.

## 로컬 파일 플레이

GitHub에 올리지 않은 개인 파일은 화면 오른쪽의 "로컬 파일로 플레이"에서 JSON과 음악 파일을 각각 선택하면 됩니다.
이 파일들은 서버로 업로드되지 않고 브라우저 메모리에서만 사용됩니다.

## 지원 노트

- tap
- hold
- roll

롱노트와 같은 lane의 겹노트는 브라우저 플레이 직전 safety pass로 제거합니다.

## 설정

- 4키/6키 키 설정
- 일시정지/리트라이/뒤로가기 키
- 전역 싱크 오프셋
- 자동 싱크
- BPM 수동값
- 노트 속도 배율
- ACC 방식

특수키/오디오 효과는 온라인 버전에서 제외했습니다.
