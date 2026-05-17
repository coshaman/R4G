# Rhythm4G Online

Rhythm4G chart JSON과 음악 파일을 서버 없이 브라우저에서 재생하는 정적 웹 버전입니다.

## 핵심 기능

- GitHub Pages 배포 가능
- `music/`와 `charts/`에 파일을 넣으면 배포 시 자동으로 `manifest.json` 생성
- 로컬 JSON/음악 파일 직접 선택 가능
- `?chart=charts/song.hard.json&audio=music/song.mp3` URL 로드 가능
- PC 키보드 입력
- 모바일 터치 입력
- tap / hold / roll 노트 지원
- 전역 설정: 키 설정, 일시정지/리트라이 키, 싱크 오프셋, 자동 싱크, BPM 표시값, 노트 속도, ACC 방식

## 중요한 점: 브라우저는 디렉터리를 직접 열람할 수 없음

브라우저 JavaScript는 보안상 `music/`와 `charts/` 폴더 안의 파일 목록을 마음대로 읽을 수 없습니다. GitHub Pages도 정적 파일 서버라서 디렉터리 목록 API를 제공하지 않습니다.

그래서 이 버전은 다음 방식으로 “자동 목록”을 구현합니다.

```text
music/와 charts/에 파일 추가
→ scripts/generate_manifest.py가 manifest.json 생성
→ 웹앱이 manifest.json을 읽어서 곡 목록 표시
```

즉, 사용자는 `manifest.json`을 손으로 수정할 필요가 없습니다. 파일만 넣고 스크립트 또는 GitHub Actions가 자동 생성하게 하면 됩니다.

## 파일 배치 규칙

```text
music/
  Song A.mp3
  Song B.mp3

charts/
  Song A.easy.json
  Song A.normal.json
  Song A.hard.json
  Song A.extreme.json
  Song A.master.json
  Song B.hard.json
```

채보 JSON 안의 `audio_path`가 있으면 그 경로를 우선합니다.

```json
{
  "title": "Song A",
  "audio_path": "music/Song A.mp3",
  "difficulty": "hard",
  "notes": []
}
```

`audio_path`가 없으면 `charts/Song A.hard.json`은 `music/Song A.mp3`와 자동 매칭을 시도합니다.

## 로컬 실행

압축을 푼 폴더에서:

```bash
python scripts/generate_manifest.py
python -m http.server 8000
```

브라우저에서:

```text
http://localhost:8000
```

## GitHub Pages 배포

이 폴더 내용을 GitHub repo 루트에 올리면 됩니다.

포함된 GitHub Actions workflow가 push마다 자동으로:

1. `music/`, `charts/` 스캔
2. `manifest.json` 생성
3. GitHub Pages 배포

을 수행합니다.

GitHub에서 Pages 설정은 다음처럼 잡으면 됩니다.

```text
Settings → Pages → Build and deployment → Source: GitHub Actions
```

이후 `music/`나 `charts/`에 파일을 추가하고 push하면 곡 목록이 자동 갱신됩니다.

## 수동 manifest 생성

GitHub Actions를 쓰지 않을 경우:

```bash
python scripts/generate_manifest.py
```

이 명령으로 `manifest.json`을 만든 뒤 같이 commit하면 됩니다.

## 로컬 파일만 쓰기

GitHub에 음악 파일을 올리고 싶지 않다면, 화면에서 직접:

- 채보 JSON 선택
- 음악 파일 선택

을 누르면 됩니다. 이 경우 파일은 브라우저 로컬에서만 사용되고 서버로 업로드되지 않습니다.

## URL로 바로 실행

```text
https://<user>.github.io/<repo>/?chart=charts/Song%20A.hard.json&audio=music/Song%20A.mp3
```

## 주의

- GitHub에는 너무 큰 음악 파일을 많이 올리지 않는 것이 좋습니다.
- 큰 음악 파일은 GitHub 저장소 용량을 빠르게 늘립니다.
- 배포용 공개 repo에 저작권 있는 음악을 올리는 것은 피하세요.
