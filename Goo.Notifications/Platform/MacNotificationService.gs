package Goo

import System
import System.Collections.Generic
import System.Runtime.InteropServices
import System.Threading.Tasks

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate MacNotificationDelegate(receiver nint, selector nint, center nint, value nint, completion nint);

internal class MacNotificationService : NotificationService {
    private let center nint
    private let target nint
    private var permission NotificationPermission = NotificationPermission.Unknown
    private var disposed bool

    private init(center nint) {
        this.center = Retain(center)
        target = Send(TargetClass, Sel("new"))
        if target == nint(0) {
            Release(this.center)
            throw InvalidOperationException("Could not create the native notification delegate")
        }
        lock Targets { Targets.Add(target, this) }
        Send(center, Sel("setDelegate:"), target)
    }

    private func RequireOpen() {
        if disposed { throw ObjectDisposedException("NotificationService") }
    }

    private func Result(status NotificationStatus = NotificationStatus.Success,
        delivery NotificationDelivery = NotificationDelivery.Unknown, id string = "", error string = "") NotificationResult ->
        NotificationResult(status, permission, delivery, NotificationActivationSupport.WarmAndCold, id, error)

    public async func GetPermissionAsync() Task[NotificationResult] {
        RequireOpen()
        let reply = await QueryAsync("getNotificationSettingsWithCompletionHandler:").ConfigureAwait(false)
        try {
            let status = int64(Send(reply.Value, Sel("authorizationStatus")))
            permission = if status == 0 { NotificationPermission.NotDetermined }
                else if status == 1 { NotificationPermission.Denied }
                else if status >= 2 && status <= 4 { NotificationPermission.Granted }
                else { NotificationPermission.Unknown }
            return Result(if permission == NotificationPermission.Denied { NotificationStatus.Denied }
                else { NotificationStatus.Success })
        } finally {
            Release(reply.Value)
        }
    }

    public async func RequestPermissionAsync() Task[NotificationResult] {
        RequireOpen()
        let current = await GetPermissionAsync().ConfigureAwait(false)
        if current.Permission != NotificationPermission.NotDetermined { return current }
        let reply = await AuthorizeAsync().ConfigureAwait(false)
        try {
            if reply.Error != nint(0) { return Result(NotificationStatus.Failed, error: ErrorText(reply.Error)) }
            permission = if reply.Value != nint(0) { NotificationPermission.Granted } else { NotificationPermission.Denied }
            return Result(if permission == NotificationPermission.Granted { NotificationStatus.Success }
                else { NotificationStatus.Denied })
        } finally {
            Release(reply.Error)
        }
    }

    public async func ShowAsync(message NotificationMessage) Task[NotificationResult] {
        ArgumentNullException.ThrowIfNull(message)
        message.Validate()
        RequireOpen()
        let current = await GetPermissionAsync().ConfigureAwait(false)
        if current.Permission != NotificationPermission.Granted {
            return Result(if current.Permission == NotificationPermission.NotDetermined { NotificationStatus.PermissionRequired }
                else if current.Permission == NotificationPermission.Unknown { NotificationStatus.Unsupported }
                else { current.Status }, id: message.Id)
        }
        let reply = await SubmitAsync(message).ConfigureAwait(false)
        try {
            return if reply.Error == nint(0) { Result(NotificationStatus.Accepted, NotificationDelivery.Accepted, message.Id) }
                else { Result(NotificationStatus.Failed, NotificationDelivery.Failed, message.Id, ErrorText(reply.Error)) }
        } finally {
            Release(reply.Error)
        }
    }

    public async func GetStatusAsync(id string) Task[NotificationResult] {
        NotificationMessage.ValidateId(id)
        RequireOpen()
        let reply = await QueryAsync("getDeliveredNotificationsWithCompletionHandler:").ConfigureAwait(false)
        try {
            let count = int64(Send(reply.Value, Sel("count")))
            var index int64 = 0
            while index < count {
                let notification = Send(reply.Value, Sel("objectAtIndex:"), nint(index))
                let request = Send(notification, Sel("request"))
                if ReadText(Send(request, Sel("identifier"))) == id {
                    return Result(delivery: NotificationDelivery.PresentInCenter, id: id)
                }
                index++
            }
            return Result(id: id)
        } finally {
            Release(reply.Value)
        }
    }

    public func RemoveAsync(id string) Task[NotificationResult] {
        NotificationMessage.ValidateId(id)
        RequireOpen()
        let pool = Send(objc_getClass("NSAutoreleasePool"), Sel("new"))
        try {
            let identifiers = Send(objc_getClass("NSArray"), Sel("arrayWithObject:"), Text(id))
            Send(center, Sel("removePendingNotificationRequestsWithIdentifiers:"), identifiers)
            Send(center, Sel("removeDeliveredNotificationsWithIdentifiers:"), identifiers)
            return Task.FromResult(Result(NotificationStatus.Accepted, NotificationDelivery.Removed, id))
        } finally {
            Send(pool, Sel("drain"))
        }
    }

    private func QueryAsync(selector string) Task[MacNotificationReply] {
        using let block = MacNotificationBlockLease(0)
        Send(center, Sel(selector), block.Pointer)
        return block.Completion.Task
    }

    private func AuthorizeAsync() Task[MacNotificationReply] {
        using let block = MacNotificationBlockLease(2)
        Send(center, Sel("requestAuthorizationWithOptions:completionHandler:"), nint(7), block.Pointer)
        return block.Completion.Task
    }

    private func SubmitAsync(message NotificationMessage) Task[MacNotificationReply] {
        let pool = Send(objc_getClass("NSAutoreleasePool"), Sel("new"))
        let content = Send(objc_getClass("UNMutableNotificationContent"), Sel("new"))
        try {
            Send(content, Sel("setTitle:"), Text(message.Title))
            Send(content, Sel("setBody:"), Text(message.Body))
            let data = Send(objc_getClass("NSMutableDictionary"), Sel("dictionary"))
            Send(data, Sel("setObject:forKey:"), Text(message.Id), Text("Goo.NotificationId"))
            Send(data, Sel("setObject:forKey:"), Text(message.Payload), Text("Goo.Payload"))
            Send(content, Sel("setUserInfo:"), data)
            let request = Send(objc_getClass("UNNotificationRequest"), Sel("requestWithIdentifier:content:trigger:"),
                Text(message.Id), content, nint(0))
            using let block = MacNotificationBlockLease(1)
            Send(center, Sel("addNotificationRequest:withCompletionHandler:"), request, block.Pointer)
            return block.Completion.Task
        } finally {
            Release(content)
            Send(pool, Sel("drain"))
        }
    }

    public func Dispose() {
        if disposed { return }
        SdlRuntime.RequireMainThread("NotificationService.Dispose")
        disposed = true
        if Send(center, Sel("delegate")) == target { Send(center, Sel("setDelegate:"), nint(0)) }
        lock Targets { Targets.Remove(target) }
        Release(target)
        Release(center)
    }

    shared {
        private let Framework nint = NativeLibrary.Load("/System/Library/Frameworks/UserNotifications.framework/UserNotifications")
        private let Targets Dictionary[nint, MacNotificationService] = Dictionary[nint, MacNotificationService]()
        private let Callback MacNotificationDelegate = Receive
        private let ResponseSelector nint = Sel("userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:")
        private let TargetClass nint = CreateTargetClass()

        @DllImport("/usr/lib/libobjc.A.dylib")
        private func objc_getProtocol(name string) nint;
        @DllImport("/usr/lib/libobjc.A.dylib")
        private func class_addProtocol(value nint, protocol nint) uint8;

        @DllImport("/usr/lib/libobjc.A.dylib")
        private func objc_getClass(name string) nint;
        @DllImport("/usr/lib/libobjc.A.dylib")
        private func objc_allocateClassPair(parent nint, name string, extra nuint) nint;
        @DllImport("/usr/lib/libobjc.A.dylib")
        private func objc_registerClassPair(value nint);
        @DllImport("/usr/lib/libobjc.A.dylib")
        private func class_addMethod(value nint, selector nint, callback nint, types string) uint8;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "sel_registerName")
        private func Sel(name string) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
        private func Send(value nint, selector nint) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
        private func Send(value nint, selector nint, argument nint) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
        private func Send(value nint, selector nint, first nint, second nint) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
        private func Send(value nint, selector nint, first nint, second nint, third nint) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
        private func SendText(value nint, selector nint, text string) nint;

        internal func Retain(value nint) nint -> if value == nint(0) { value } else { Send(value, Sel("retain")) }

        internal func Release(value nint) {
            if value != nint(0) { Send(value, Sel("release")) }
        }

        private func Text(value string) nint -> SendText(objc_getClass("NSString"), Sel("stringWithUTF8String:"), value)

        private func ReadText(value nint) string -> if value == nint(0) { "" }
            else { Marshal.PtrToStringUTF8(Send(value, Sel("UTF8String"))) ?? "" }

        private func ErrorText(error nint) string -> ReadText(Send(error, Sel("localizedDescription")))

        private func CreateTargetClass() nint {
            let native = objc_allocateClassPair(objc_getClass("NSObject"), "GooNotificationCenterDelegate", nuint(0))
            if native == nint(0) { throw InvalidOperationException("Could not register the native notification delegate") }
            class_addProtocol(native, objc_getProtocol("UNUserNotificationCenterDelegate"))
            let pointer = Marshal.GetFunctionPointerForDelegate(Callback)
            if class_addMethod(native, ResponseSelector, pointer, "v@:@@@?") == 0
                || class_addMethod(native, Sel("userNotificationCenter:willPresentNotification:withCompletionHandler:"),
                    pointer, "v@:@@@?") == 0 {
                throw InvalidOperationException("Could not register native notification callbacks")
            }
            objc_registerClassPair(native)
            return native
        }

        internal func Open(identifier string, options NotificationOptions) NotificationServiceResult {
            SdlRuntime.RequireMainThread("Notifications.Open")
            let pool = Send(objc_getClass("NSAutoreleasePool"), Sel("new"))
            try {
                let bundle = Send(objc_getClass("NSBundle"), Sel("mainBundle"))
                if ReadText(Send(bundle, Sel("bundleIdentifier"))) != identifier {
                    return NotificationServiceResult(NotificationStatus.MissingIdentity,
                        error: "Notifications require an app bundle matching the configured application identifier")
                }
                let center = Send(objc_getClass("UNUserNotificationCenter"), Sel("currentNotificationCenter"))
                if center == nint(0) { return NotificationServiceResult(NotificationStatus.Unsupported) }
                if Send(center, Sel("delegate")) != nint(0) {
                    return NotificationServiceResult(NotificationStatus.Unsupported,
                        error: "The native notification center delegate is already owned")
                }
                return NotificationServiceResult(NotificationStatus.Success, MacNotificationService(center))
            } finally {
                Send(pool, Sel("drain"))
            }
        }

        private func Receive(receiver nint, selector nint, center nint, value nint, completion nint) {
            if selector != ResponseSelector {
                MacNotificationBlockLease.Present(completion)
                return
            }
            try {
                lock Targets {
                    if !Targets.TryGetValue(receiver, out let service) || service.disposed { return }
                    let action = ReadText(Send(value, Sel("actionIdentifier")))
                    if action == "com.apple.UNNotificationDismissActionIdentifier" { return }
                    let notification = Send(value, Sel("notification"))
                    let request = Send(notification, Sel("request"))
                    let content = Send(request, Sel("content"))
                    let data = Send(content, Sel("userInfo"))
                    Window.PostApplicationActivation(ApplicationActivation {
                        Kind: ApplicationActivationKind.Notification, IsInitial: Window.IsInitialApplicationActivation,
                        NotificationId: ReadText(Send(data, Sel("objectForKey:"), Text("Goo.NotificationId"))),
                        ActionId: "default", Payload: ReadText(Send(data, Sel("objectForKey:"), Text("Goo.Payload"))),
                    })
                }
            } finally {
                MacNotificationBlockLease.Complete(completion)
            }
        }
    }
}
