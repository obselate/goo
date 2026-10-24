#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <ole2.h>
#include <shlobj.h>
#include <shellapi.h>
#include <algorithm>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace fs = std::filesystem;
static HWND window_handle;
static bool source_mode;
static bool cancelled;
static bool stopped;
static bool failed;
static DWORD desired_effect;
static std::wstring content_kind;
static fs::path directory_path;
static fs::path png_path;
static const char *mime_types[] = {
    "text/plain;charset=utf-8", "image/png", "application/x-goo-transfer-check", "application/x-goo-empty"
};

static void require(bool condition, const char *message)
{
    if (!condition) throw std::runtime_error(message);
}

static std::vector<unsigned char> file_bytes(const fs::path &path)
{
    std::ifstream file(path, std::ios::binary);
    require(file.good(), "Cannot open fixture document");
    return std::vector<unsigned char>(std::istreambuf_iterator<char>(file), {});
}

static std::vector<unsigned char> expected_bytes(size_t index)
{
    if (index == 0) {
        const std::string text = "native MIME transfer";
        return { text.begin(), text.end() };
    }
    if (index == 1) return file_bytes(png_path);
    if (index == 3) return {};
    std::vector<unsigned char> bytes(1048576);
    for (size_t i = 0; i < bytes.size(); ++i) bytes[i] = static_cast<unsigned char>(i);
    return bytes;
}

static void set_data(IDataObject *object, CLIPFORMAT format, const void *bytes, size_t length)
{
    STGMEDIUM medium = {};
    medium.tymed = TYMED_HGLOBAL;
    medium.hGlobal = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, std::max(size_t(1), length));
    require(medium.hGlobal != nullptr, "Cannot allocate native transfer data");
    void *memory = GlobalLock(medium.hGlobal);
    require(memory != nullptr, "Cannot lock native transfer data");
    if (length) std::memcpy(memory, bytes, length);
    GlobalUnlock(medium.hGlobal);
    FORMATETC descriptor = { format, nullptr, DVASPECT_CONTENT, -1, TYMED_HGLOBAL };
    HRESULT result = object->SetData(&descriptor, &medium, TRUE);
    if (FAILED(result)) ReleaseStgMedium(&medium);
    require(SUCCEEDED(result), "IDataObject.SetData failed");
}

static std::vector<unsigned char> read_data(IDataObject *object, CLIPFORMAT format)
{
    FORMATETC descriptor = { format, nullptr, DVASPECT_CONTENT, -1, TYMED_HGLOBAL };
    STGMEDIUM medium = {};
    require(SUCCEEDED(object->GetData(&descriptor, &medium)), "IDataObject.GetData failed");
    try {
        require(medium.tymed == TYMED_HGLOBAL, "The requested global medium was not returned");
        const SIZE_T length = GlobalSize(medium.hGlobal);
        require(length <= 67108864, "Native representation exceeds the byte limit");
        const auto *bytes = static_cast<const unsigned char *>(GlobalLock(medium.hGlobal));
        require(bytes != nullptr, "Cannot lock received transfer data");
        std::vector<unsigned char> result(bytes, bytes + length);
        GlobalUnlock(medium.hGlobal);
        ReleaseStgMedium(&medium);
        return result;
    } catch (...) {
        ReleaseStgMedium(&medium);
        throw;
    }
}

static IDataObject *make_data()
{
    IDataObject *object = nullptr;
    require(SUCCEEDED(SHCreateDataObject(nullptr, 0, nullptr, nullptr, IID_PPV_ARGS(&object))), "SHCreateDataObject failed");
    try {
        if (content_kind == L"files" || content_kind == L"optimized") {
            std::vector<wchar_t> names;
            for (int i = 0; i < 2; ++i) {
                const std::wstring name = (directory_path / (L"source-" + std::to_wstring(i) + L".txt")).wstring();
                names.insert(names.end(), name.begin(), name.end());
                names.push_back(0);
            }
            names.push_back(0);
            std::vector<unsigned char> bytes(sizeof(DROPFILES) + names.size() * sizeof(wchar_t));
            auto *header = reinterpret_cast<DROPFILES *>(bytes.data());
            header->pFiles = static_cast<DWORD>(sizeof(DROPFILES));
            header->fWide = TRUE;
            std::memcpy(bytes.data() + sizeof(DROPFILES), names.data(), names.size() * sizeof(wchar_t));
            set_data(object, CF_HDROP, bytes.data(), bytes.size());
        } else {
            for (size_t i = 0; i < 4; ++i) {
                auto bytes = expected_bytes(i);
                set_data(object, static_cast<CLIPFORMAT>(RegisterClipboardFormatA(mime_types[i])), bytes.data(), bytes.size());
            }
            const std::string empty = std::string(mime_types[3]) + "\n";
            set_data(object, static_cast<CLIPFORMAT>(RegisterClipboardFormatA("Goo Empty MIME Types")), empty.data(), empty.size());
        }
        return object;
    } catch (...) {
        object->Release();
        throw;
    }
}

static void check_data(IDataObject *object)
{
    if (content_kind == L"files" || content_kind == L"optimized") {
        FORMATETC descriptor = { CF_HDROP, nullptr, DVASPECT_CONTENT, -1, TYMED_HGLOBAL };
        STGMEDIUM medium = {};
        require(SUCCEEDED(object->GetData(&descriptor, &medium)), "Native file list was not available");
        try {
            require(DragQueryFileW(static_cast<HDROP>(medium.hGlobal), 0xffffffff, nullptr, 0) == 2, "File count changed");
            for (UINT i = 0; i < 2; ++i) {
                const UINT length = DragQueryFileW(static_cast<HDROP>(medium.hGlobal), i, nullptr, 0);
                require(length > 0 && length < 32768, "Invalid native file path length");
                std::vector<wchar_t> name(length + 1);
                require(DragQueryFileW(static_cast<HDROP>(medium.hGlobal), i, name.data(), length + 1) == length, "Cannot read native file path");
                const fs::path from(name.data());
                const fs::path expected = directory_path / (L"source-" + std::to_wstring(i) + L".txt");
                require(fs::equivalent(from, expected), "Native file path changed");
                const fs::path to = directory_path / (L"destination-" + std::to_wstring(i) + L".txt");
                const bool copied = desired_effect == DROPEFFECT_MOVE
                    ? MoveFileExW(from.c_str(), to.c_str(), MOVEFILE_COPY_ALLOWED | MOVEFILE_REPLACE_EXISTING) != FALSE
                    : CopyFileW(from.c_str(), to.c_str(), FALSE) != FALSE;
                require(copied, "Native target file operation failed");
                const std::string text = "native file " + std::to_string(i);
                require(file_bytes(to) == std::vector<unsigned char>(text.begin(), text.end()), "Native file contents changed");
            }
            ReleaseStgMedium(&medium);
        } catch (...) {
            ReleaseStgMedium(&medium);
            throw;
        }
        set_data(object, static_cast<CLIPFORMAT>(RegisterClipboardFormatW(L"Logical Performed DropEffect")), &desired_effect, sizeof(desired_effect));
        return;
    }
    const auto marker = read_data(object, static_cast<CLIPFORMAT>(RegisterClipboardFormatA("Goo Empty MIME Types")));
    const std::string empty(marker.begin(), marker.end());
    require(empty.find(std::string(mime_types[3]) + "\n") != std::string::npos, "Empty MIME metadata changed");
    for (size_t i = 0; i < 4; ++i) {
        auto bytes = read_data(object, static_cast<CLIPFORMAT>(RegisterClipboardFormatA(mime_types[i])));
        if (i == 3) {
            require(bytes.size() == 1 && bytes[0] == 0, "Empty MIME storage changed");
            bytes.clear();
        }
        require(bytes == expected_bytes(i), "Native MIME bytes changed");
    }
}

class PeerDropSource final : public IDropSource {
    LONG references = 1;
public:
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id, void **value) override {
        if (!value) return E_POINTER;
        *value = nullptr;
        if (id != IID_IUnknown && id != IID_IDropSource) return E_NOINTERFACE;
        *value = this;
        AddRef();
        return S_OK;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return static_cast<ULONG>(InterlockedIncrement(&references)); }
    ULONG STDMETHODCALLTYPE Release() override {
        const LONG left = InterlockedDecrement(&references);
        if (!left) delete this;
        return static_cast<ULONG>(left);
    }
    HRESULT STDMETHODCALLTYPE QueryContinueDrag(BOOL escape, DWORD keys) override {
        if (escape || cancelled) return DRAGDROP_S_CANCEL;
        return keys & MK_LBUTTON ? S_OK : DRAGDROP_S_DROP;
    }
    HRESULT STDMETHODCALLTYPE GiveFeedback(DWORD) override { return DRAGDROP_S_USEDEFAULTCURSORS; }
};

class PeerDropTarget final : public IDropTarget {
    LONG references = 1;
public:
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id, void **value) override {
        if (!value) return E_POINTER;
        *value = nullptr;
        if (id != IID_IUnknown && id != IID_IDropTarget) return E_NOINTERFACE;
        *value = this;
        AddRef();
        return S_OK;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return static_cast<ULONG>(InterlockedIncrement(&references)); }
    ULONG STDMETHODCALLTYPE Release() override {
        const LONG left = InterlockedDecrement(&references);
        if (!left) delete this;
        return static_cast<ULONG>(left);
    }
    HRESULT STDMETHODCALLTYPE DragEnter(IDataObject *, DWORD, POINTL, DWORD *effect) override {
        *effect &= desired_effect;
        return S_OK;
    }
    HRESULT STDMETHODCALLTYPE DragOver(DWORD, POINTL, DWORD *effect) override {
        *effect &= desired_effect;
        return S_OK;
    }
    HRESULT STDMETHODCALLTYPE DragLeave() override { return S_OK; }
    HRESULT STDMETHODCALLTYPE Drop(IDataObject *object, DWORD, POINTL, DWORD *effect) override {
        try {
            check_data(object);
            *effect = content_kind == L"optimized" ? DROPEFFECT_COPY : desired_effect;
            std::cout << "drop-complete " << desired_effect << std::endl;
            stopped = true;
            return S_OK;
        } catch (const std::exception &error) {
            *effect = DROPEFFECT_NONE;
            std::cerr << error.what() << std::endl;
            failed = true;
            stopped = true;
            return E_FAIL;
        }
    }
};

static LRESULT CALLBACK window_proc(HWND window, UINT message, WPARAM wparam, LPARAM lparam)
{
    if (message == WM_LBUTTONDOWN && source_mode) {
        try {
            IDataObject *object = make_data();
            auto *source = new PeerDropSource();
            DWORD selected = DROPEFFECT_NONE;
            std::cout << "start 0" << std::endl;
            const HRESULT status = DoDragDrop(object, source, DROPEFFECT_COPY | DROPEFFECT_MOVE, &selected);
            const int outcome = status == DRAGDROP_S_CANCEL ? 1 : status == DRAGDROP_S_DROP ? (selected ? 0 : 1) : 5;
            const int remove = selected == DROPEFFECT_MOVE && content_kind == L"mime" ? 1 : 0;
            std::cout << "source-end " << outcome << " " << selected << " " << remove << std::endl;
            source->Release();
            object->Release();
            stopped = true;
        } catch (const std::exception &error) {
            std::cerr << error.what() << std::endl;
            failed = true;
            stopped = true;
        }
        return 0;
    }
    if (message == WM_CLOSE) {
        cancelled = true;
        stopped = true;
        return 0;
    }
    return DefWindowProcW(window, message, wparam, lparam);
}

static void mouse_button(bool down)
{
    INPUT input = {};
    input.type = INPUT_MOUSE;
    input.mi.dwFlags = down ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP;
    require(SendInput(1, &input, sizeof(input)) == 1, "Native mouse button input was not accepted");
}

static int input_drag(const wchar_t *source_title, const wchar_t *target_title, DWORD hold)
{
    HWND source = nullptr;
    HWND target = nullptr;
    const ULONGLONG end = GetTickCount64() + 15000;
    while ((!source || !target) && GetTickCount64() < end) {
        source = FindWindowW(nullptr, source_title);
        target = FindWindowW(nullptr, target_title);
        Sleep(20);
    }
    require(source && target, "Native transfer windows did not appear");
    require(SetWindowPos(source, HWND_TOPMOST, 40, 40, 480, 200, SWP_SHOWWINDOW) != FALSE, "Cannot place source window");
    require(SetWindowPos(target, HWND_TOPMOST, 540, 330, 480, 200, SWP_SHOWWINDOW) != FALSE, "Cannot place target window");
    SetForegroundWindow(source);
    POINT from = { 150, 80 };
    POINT to = { 150, 80 };
    require(ClientToScreen(source, &from) && ClientToScreen(target, &to), "Cannot resolve native drag coordinates");
    require(SetCursorPos(from.x, from.y) != FALSE, "Cannot reach source window");
    Sleep(100);
    mouse_button(true);
    try {
        Sleep(100);
        require(SetCursorPos(from.x + 24, from.y + 12) != FALSE, "Cannot promote source gesture");
        Sleep(150);
        require(SetCursorPos(to.x, to.y) != FALSE, "Cannot reach target window");
        Sleep(hold);
        mouse_button(false);
    } catch (...) {
        mouse_button(false);
        throw;
    }
    std::cout << "input-complete" << std::endl;
    return 0;
}

int wmain(int argc, wchar_t **argv)
{
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    try {
        require(argc >= 3, "A peer mode and window title are required");
        if (std::wstring(argv[1]) == L"input") {
            require(argc == 5, "Input requires source and target titles and a hold time");
            return input_drag(argv[2], argv[3], static_cast<DWORD>(std::stoul(argv[4])));
        }
        if (std::wstring(argv[1]) == L"close") {
            HWND window = FindWindowW(nullptr, argv[2]);
            require(window != nullptr, "The fixture window is missing");
            require(PostMessageW(window, WM_CLOSE, 0, 0) != FALSE, "Cannot close fixture window");
            return 0;
        }
        require(argc == 7, "Peer requires title, effect, content kind, directory and PNG");
        source_mode = std::wstring(argv[1]) == L"source";
        desired_effect = static_cast<DWORD>(std::stoul(argv[3]));
        require(desired_effect == DROPEFFECT_COPY || desired_effect == DROPEFFECT_MOVE, "Invalid native effect");
        content_kind = argv[4];
        directory_path = argv[5];
        png_path = argv[6];
        require(SUCCEEDED(OleInitialize(nullptr)), "OleInitialize failed");
        WNDCLASSW window_class = {};
        window_class.lpfnWndProc = window_proc;
        window_class.hInstance = GetModuleHandleW(nullptr);
        window_class.lpszClassName = L"GooDataTransferPeer";
        require(RegisterClassW(&window_class) != 0, "Cannot register peer window class");
        window_handle = CreateWindowW(window_class.lpszClassName, argv[2], WS_OVERLAPPEDWINDOW | WS_VISIBLE,
            540, 330, 480, 200, nullptr, nullptr, window_class.hInstance, nullptr);
        require(window_handle != nullptr, "Cannot create native peer window");
        PeerDropTarget *target = nullptr;
        if (!source_mode) {
            target = new PeerDropTarget();
            require(SUCCEEDED(RegisterDragDrop(window_handle, target)), "Cannot register native peer target");
        }
        std::cout << "ready" << std::endl;
        while (!stopped) {
            MSG message;
            while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }
            MsgWaitForMultipleObjects(0, nullptr, FALSE, 10, QS_ALLINPUT);
        }
        if (target) {
            RevokeDragDrop(window_handle);
            target->Release();
        }
        DestroyWindow(window_handle);
        OleUninitialize();
        return failed ? 1 : 0;
    } catch (const std::exception &error) {
        std::cerr << error.what() << std::endl;
        return 1;
    }
}
