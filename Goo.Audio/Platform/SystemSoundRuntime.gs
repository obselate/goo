package Goo

import System
import System.Runtime.InteropServices

internal unsafe class SystemSoundRuntime {
    shared {
        private let gate object = Object()
        private var linuxContext nint

        internal func Play(sound SystemSound) SystemSoundStatus {
            try {
                if OperatingSystem.IsWindows() {
                    let alias = if sound == SystemSound.Click {
                        "MenuCommand"
                    } else {
                        "SystemExclamation"
                    }
                    return if PlayWindows(alias, nint(0), 0x10003u) != 0 {
                        SystemSoundStatus.Queued
                    } else {
                        SystemSoundStatus.NativeFailure
                    }
                }
                if OperatingSystem.IsMacOS() {
                    if sound == SystemSound.Click {
                        return SystemSoundStatus.Unsupported
                    }
                    BeepMac()
                    return SystemSoundStatus.Queued
                }
                if OperatingSystem.IsLinux() && !OperatingSystem.IsAndroid() {
                    lock gate {
                        if linuxContext == nint(0) {
                            var context nint
                            if CreateLinux(&context) < 0 {
                                return SystemSoundStatus.NativeFailure
                            }
                            linuxContext = context
                            AppDomain.CurrentDomain.ProcessExit += Shutdown
                        }
                        let eventId = if sound == SystemSound.Click {
                            "button-pressed"
                        } else {
                            "dialog-warning"
                        }
                        let result = PlayLinux(linuxContext, 0u, "event.id", eventId, nint(0))
                        return if result == 0 {
                            SystemSoundStatus.Queued
                        } else if result == -1 || result == -5 || result == -9 {
                            SystemSoundStatus.Unsupported
                        } else {
                            SystemSoundStatus.NativeFailure
                        }
                    }
                }
            } catch (error DllNotFoundException) {
                return SystemSoundStatus.Unsupported
            } catch (error EntryPointNotFoundException) {
                return SystemSoundStatus.Unsupported
            }
            return SystemSoundStatus.Unsupported
        }

        private func Shutdown(sender object?, arguments EventArgs) {
            lock gate {
                if linuxContext != nint(0) {
                    DestroyLinux(linuxContext)
                    linuxContext = nint(0)
                }
            }
        }

        @DllImport("winmm.dll", EntryPoint: "PlaySoundW", CharSet: CharSet.Unicode)
        private func PlayWindows(name string, module nint, flags uint32) int32;

        @DllImport("/System/Library/Frameworks/AppKit.framework/AppKit", EntryPoint: "NSBeep")
        private func BeepMac();

        @DllImport("libcanberra.so.0", EntryPoint: "ca_context_create")
        private func CreateLinux(context *nint) int32;

        @DllImport("libcanberra.so.0", EntryPoint: "ca_context_play", CallingConvention: CallingConvention.Cdecl)
        private func PlayLinux(context nint, id uint32, key string, value string, end nint) int32;

        @DllImport("libcanberra.so.0", EntryPoint: "ca_context_destroy")
        private func DestroyLinux(context nint) int32;
    }
}
