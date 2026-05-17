# Rhythm4G Online

Rhythm4G Online은 서버 없이 GitHub Pages에서 동작하는 프론트엔드 전용 리듬게임 플레이어입니다.

- Rhythm4G 채보 JSON 업로드 후 플레이
- 로컬 음악 파일 업로드 후 플레이
- 같은 디렉토리의 `music/`, `charts/` 파일을 경로 또는 `manifest.json`으로 로드
- 키보드 입력 지원
- 모바일 터치 입력 지원
- 전역 설정 지원: 키 설정, 싱크 오프셋, 자동 싱크, BPM 수동값, 노트 속도 배율, ACC 방식
- tap / hold / roll 노트 지원
- 1,000,000점 만점 점수 체계

특수키/음향 효과 기능은 온라인 버전에서 제외했습니다.

## 폴더 구조

```text
rhythm4g_online/
  index.html
  manifest.json
  src/
    app.js
    styles.css
  music/
    example.mp3       # 직접 추가
  charts/
    example.hard.json # 직접 추가
```

`music/`과 `charts/` 폴더는 예시용입니다. GitHub 저장소에는 저작권 문제가 없는 파일만 올리세요.

## 로컬 실행

브라우저 보안 정책 때문에 `file://`로 직접 열면 같은 디렉토리 경로 로딩이 제한될 수 있습니다. 로컬 서버로 실행하세요.

Python이 있으면:

```bash
python -m http.server 8000
```

브라우저에서:

```text
http://localhost:8000
```

## GitHub Pages 배포

1. 이 폴더 내용을 GitHub 저장소에 올립니다.
2. GitHub 저장소에서 `Settings` → `Pages`로 이동합니다.
3. Source를 `Deploy from a branch`로 설정합니다.
4. Branch를 `main`, folder를 `/root`로 설정합니다.
5. 배포 URL에 접속합니다.

## 로컬 파일로 플레이

1. `채보 JSON` 버튼으로 `.json` 파일을 선택합니다.
2. `음악 파일` 버튼으로 해당 `.mp3` 또는 오디오 파일을 선택합니다.
3. `플레이 시작`을 누릅니다.

이 방식은 파일이 GitHub에 올라가지 않고 사용자의 브라우저 안에서만 처리됩니다.

## 같은 디렉토리 파일로 플레이

저장소에 다음처럼 파일을 넣었다고 가정합니다.

```text
music/song.mp3
charts/song.hard.json
```

웹 화면에서 다음 경로를 입력합니다.

```text
charts/song.hard.json
music/song.mp3
```

또는 URL 파라미터로 바로 로드할 수 있습니다.

```text
/?chart=charts/song.hard.json&audio=music/song.mp3
```

## manifest.json 곡 목록

`manifest.json`을 수정하면 메인 화면에 곡 목록이 표시됩니다.

```json
{
  "songs": [
    {
      "title": "Song Title",
      "audio": "music/song.mp3",
      "charts": [
        { "difficulty": "hard", "path": "charts/song.hard.json" },
        { "difficulty": "master", "path": "charts/song.master.json" }
      ]
    }
  ]
}
```

현재 UI에서는 manifest의 첫 번째 chart를 기본 선택합니다. 여러 난이도 선택 UI는 이후 확장 지점입니다.

## 설정 설명

- `싱크 오프셋(ms)`: 양수면 판정 기준이 뒤로, 음수면 앞으로 이동합니다.
- `자동 싱크`: 플레이 중 일정한 빠름/느림 경향이 감지되면 런타임 오프셋을 소폭 조정합니다.
- `BPM 수동 표시/그리드`: 채보의 BPM 대신 화면 grid 계산에 사용할 BPM입니다. 노트 실제 타이밍은 JSON의 `time`을 따릅니다.
- `노트 속도 배율`: 모든 노트의 낙하 속도 배율입니다.
- `ACC 방식`: 누적 방식 또는 100% 시작 방식을 선택합니다.
- `키 설정`: PC 키보드 플레이용 키입니다. 모바일은 터치 lane으로 입력합니다.

## 채보 호환

Rhythm4G Python 버전에서 생성한 JSON을 기준으로 합니다.

지원 노트 타입:

```json
{ "type": "tap", "lane": 0, "time": 1.234 }
{ "type": "hold", "lane": 2, "time": 4.0, "end_time": 6.0 }
{ "type": "roll", "time": 9.0, "end_time": 11.0, "required_hits": 18 }
```

온라인 버전은 로드 시 한 번 더 safety pass를 수행하여 롱노트 sustain 구간에 같은 lane의 tap이 겹치지 않게 제거합니다.

## 주의

GitHub Pages는 정적 호스팅입니다. MP3를 업로드해서 자동 채보를 생성하는 기능은 포함되어 있지 않습니다.
