cmake_minimum_required(VERSION 3.22.1)
project(gadaczllama)

# ✍️ SILNIK PISANIA — budujemy llama.cpp ze źródeł i pakujemy do apki jako
# bibliotekę natywną (arm64). Bierzemy TYLKO rdzeń (jak w kroku 1): bez narzędzi,
# serwera, przykładów — one nie kompilują się na Androidzie (posix_spawn itp.).
include(FetchContent)

set(LLAMA_BUILD_TESTS    OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER   OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS    OFF CACHE BOOL "" FORCE)
set(LLAMA_CURL           OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP          OFF CACHE BOOL "" FORCE)

FetchContent_Declare(
    llama
    GIT_REPOSITORY https://github.com/ggml-org/llama.cpp
    GIT_TAG master
)
FetchContent_MakeAvailable(llama)

add_library(gadaczllama SHARED llama-android.cpp)
target_link_libraries(gadaczllama llama android log)
