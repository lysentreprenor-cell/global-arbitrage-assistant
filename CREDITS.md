# Podziękowania i licencje (Gadacz)

## Lokalny mózg (tryb offline)

Gadacz może używać małego modelu językowego działającego w telefonie
(opcjonalne pobranie „Pobierz lokalny mózg").

- **Model:** Qwen2.5-0.5B-Instruct (w formacie MediaPipe `.task`, wydanie
  społeczności LiteRT / `litert-community`).
- **Autor modelu:** Qwen Team, Alibaba Cloud.
- **Licencja:** Apache License 2.0 — pozwala na użycie, kopiowanie i
  rozpowszechnianie, także komercyjnie, pod warunkiem zachowania
  informacji o autorze i licencji (ten plik ją spełnia).
- Pełny tekst licencji: https://www.apache.org/licenses/LICENSE-2.0

## Silnik uruchamiający model

- **MediaPipe / LiteRT LLM Inference** (`com.google.mediapipe:tasks-genai`),
  autor: Google. Licencja: Apache License 2.0.

## Uwaga

Ten plik istnieje, aby spełnić warunek atrybucji licencji Apache 2.0.
Nie jest poradą prawną. Jeśli w przyszłości zmieni się użyty model,
należy zaktualizować tę notkę zgodnie z licencją nowego modelu.

## Ucho Gadacza (rozpoznawanie mowy offline)

- **Silnik:** Vosk / Kaldi (`com.alphacephei:vosk-android`), autor: Alpha
  Cephei Inc. Licencja: Apache License 2.0.
- **Model języka polskiego:** vosk-model-small-pl-0.22 (~50 MB), autor:
  Alpha Cephei Inc. Licencja: Apache License 2.0.
- **JNA** (`net.java.dev.jna:jna`) — Apache License 2.0 / LGPL 2.1 (używana
  na warunkach Apache 2.0).
- Pełny tekst licencji: https://www.apache.org/licenses/LICENSE-2.0

## Oczy do tekstu (czytanie kartek offline)

- **ML Kit Text Recognition** (`com.google.mlkit:text-recognition`), autor:
  Google. Bezpłatna biblioteka działająca w całości na urządzeniu (bez chmury),
  na warunkach ML Kit Terms of Service.

## Usta Gadacza (piękny głos offline)

- **Silnik:** sherpa-onnx (`com.k2fsa.sherpa.onnx:sherpa-onnx-android`),
  autor: k2-fsa / Next-gen Kaldi. Licencja: Apache License 2.0.
- **Głos:** Piper `pl_PL-gosia-medium` (projekt Piper Rhasspy, autor: Michael
  Hansen i społeczność). Licencja Piper: MIT; model głosu udostępniony
  publicznie w kolekcji modeli sherpa-onnx.
- Pełne teksty licencji: https://www.apache.org/licenses/LICENSE-2.0 ·
  https://opensource.org/licenses/MIT
