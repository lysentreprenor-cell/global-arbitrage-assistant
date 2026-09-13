// ✍️ SILNIK PISANIA (llama.cpp) — most JNI między Kotlinem a natywnym llama.cpp.
// Ładuje model GGUF, generuje odpowiedź po polsku i zwraca ją jako tekst.
// Stabilny silnik offline — zastępuje kapryśny MediaPipe, który wywalał apkę.
#include <jni.h>
#include <string>
#include <vector>
#include <android/log.h>
#include "llama.h"

#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, "GadaczLlama", __VA_ARGS__)

extern "C" JNIEXPORT jstring JNICALL
Java_pl_gadacz_app_LlamaCpp_nativeHello(JNIEnv* env, jobject /* thiz */) {
    llama_backend_init();
    std::string s = "llama.cpp wpiety OK";
    llama_backend_free();
    return env->NewStringUTF(s.c_str());
}

// 🧠 Wczytaj model GGUF + wygeneruj odpowiedź. Wszystko w jednym wywołaniu
// (wczytaj → pisz → zwolnij) — proste i odporne. maxTokens ogranicza długość.
extern "C" JNIEXPORT jstring JNICALL
Java_pl_gadacz_app_LlamaCpp_nativeGenerate(
        JNIEnv* env, jobject /* thiz */,
        jstring jModelPath, jstring jPrompt, jint jMaxTokens, jint jThreads) {

    const char* cModelPath = env->GetStringUTFChars(jModelPath, nullptr);
    const char* cPrompt    = env->GetStringUTFChars(jPrompt, nullptr);
    std::string modelPath  = cModelPath ? cModelPath : "";
    std::string prompt     = cPrompt ? cPrompt : "";
    env->ReleaseStringUTFChars(jModelPath, cModelPath);
    env->ReleaseStringUTFChars(jPrompt, cPrompt);

    int maxTokens = jMaxTokens > 0 ? (int) jMaxTokens : 200;
    int threads   = jThreads   > 0 ? (int) jThreads   : 4;

    llama_backend_init();

    std::string result;
    auto fail = [&](const char* msg) -> jstring {
        llama_backend_free();
        std::string e = std::string("BLAD: ") + msg;
        return env->NewStringUTF(e.c_str());
    };

    // 1️⃣ Model (CPU, bez GPU).
    llama_model_params mparams = llama_model_default_params();
    mparams.n_gpu_layers = 0;
    llama_model* model = llama_model_load_from_file(modelPath.c_str(), mparams);
    if (!model) return fail("nie wczytano modelu");
    const llama_vocab* vocab = llama_model_get_vocab(model);

    // 2️⃣ Kontekst.
    llama_context_params cparams = llama_context_default_params();
    cparams.n_ctx         = 2048;
    cparams.n_threads     = threads;
    cparams.n_threads_batch = threads;
    llama_context* ctx = llama_init_from_model(model, cparams);
    if (!ctx) { llama_model_free(model); return fail("brak kontekstu"); }

    // 3️⃣ Tokenizacja promptu.
    int n_prompt = -llama_tokenize(vocab, prompt.c_str(), (int) prompt.size(),
                                   nullptr, 0, true, true);
    std::vector<llama_token> tokens(n_prompt);
    if (llama_tokenize(vocab, prompt.c_str(), (int) prompt.size(),
                       tokens.data(), (int) tokens.size(), true, true) < 0) {
        llama_free(ctx); llama_model_free(model); return fail("tokenizacja");
    }

    // 4️⃣ Sampler: temperatura + top-p (naturalny, ale spójny tekst).
    llama_sampler* smpl = llama_sampler_chain_init(llama_sampler_chain_default_params());
    llama_sampler_chain_add(smpl, llama_sampler_init_top_k(40));
    llama_sampler_chain_add(smpl, llama_sampler_init_top_p(0.95f, 1));
    llama_sampler_chain_add(smpl, llama_sampler_init_temp(0.7f));
    llama_sampler_chain_add(smpl, llama_sampler_init_dist(LLAMA_DEFAULT_SEED));

    // 5️⃣ Wrzuć prompt do kontekstu.
    llama_batch batch = llama_batch_get_one(tokens.data(), (int) tokens.size());
    if (llama_decode(ctx, batch) != 0) {
        llama_sampler_free(smpl); llama_free(ctx); llama_model_free(model);
        return fail("dekodowanie promptu");
    }

    // 6️⃣ Pętla generowania: token po tokenie, aż do końca myśli albo limitu.
    for (int i = 0; i < maxTokens; i++) {
        llama_token id = llama_sampler_sample(smpl, ctx, -1);
        if (llama_vocab_is_eog(vocab, id)) break;
        char piece[256];
        int n = llama_token_to_piece(vocab, id, piece, sizeof(piece), 0, true);
        if (n > 0) result.append(piece, n);
        llama_batch nb = llama_batch_get_one(&id, 1);
        if (llama_decode(ctx, nb) != 0) break;
    }

    // 7️⃣ Sprzątanie.
    llama_sampler_free(smpl);
    llama_free(ctx);
    llama_model_free(model);
    llama_backend_free();

    if (result.empty()) result = "(pusto)";
    return env->NewStringUTF(result.c_str());
}
