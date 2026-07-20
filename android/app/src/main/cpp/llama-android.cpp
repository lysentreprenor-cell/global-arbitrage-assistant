// ✍️ SILNIK PISANIA (llama.cpp) — most JNI między Kotlinem a natywnym llama.cpp.
// ETAP 2a: minimalny sprawdzian — inicjujemy backend i wracamy z napisem. Chodzi
// tylko o potwierdzenie, że biblioteka wpina się do apki, kompiluje i ładuje.
// Prawdziwe generowanie tekstu dojdzie w etapie 2b.
#include <jni.h>
#include <string>
#include "llama.h"

extern "C" JNIEXPORT jstring JNICALL
Java_pl_gadacz_app_LlamaCpp_nativeHello(JNIEnv* env, jobject /* thiz */) {
    llama_backend_init();
    std::string s = "llama.cpp wpiety OK";
    llama_backend_free();
    return env->NewStringUTF(s.c_str());
}
