# Rhythm4G Online

정적 웹으로 실행되는 Rhythm4G 플레이어입니다. 서버 없이 GitHub Pages에서 동작합니다.

## 링크

- 채보 제작 프로그램: https://drive.google.com/file/d/16K75hilq63fbOOWtmtmwqpYPxXOkQl-s/view?usp=drive_link
- 개발자 포트폴리오: https://www.coshaman.com

## 곡 추가

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

push하면 GitHub Actions가 `manifest.json`을 생성하고, 사이트의 온라인 라이브러리에 표시됩니다.

## 로컬 테스트

```bash
python scripts/generate_manifest.py
python -m http.server 8000
```

브라우저에서 `http://localhost:8000`으로 접속합니다.

## GitHub Pages

Repository Settings → Pages → Build and deployment → Source를 `GitHub Actions`로 설정합니다.
