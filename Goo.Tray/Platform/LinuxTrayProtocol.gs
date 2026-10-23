package Goo

import System
import System.Text
import System.Threading
import System.Threading.Tasks
import Tmds.DBus.Protocol

internal partial class LinuxTrayBackend {
    public func HandleMethodAsync(context MethodContext) ValueTask {
        try {
            if Volatile.Read(ref closed) != 0 {
                context.ReplyError("org.freedesktop.DBus.Error.UnknownObject", "The tray icon is closed")
            } else if context.Request.PathAsString != ItemPath && context.Request.PathAsString != MenuPath {
                context.ReplyError("org.freedesktop.DBus.Error.UnknownObject", "Unknown tray object")
            } else if context.Request.InterfaceAsString == PropertiesInterface {
                HandleProperties(context)
            } else if context.Request.InterfaceAsString == "org.freedesktop.DBus.Introspectable"
                && context.Request.MemberAsString == "Introspect" && context.Request.SignatureAsString == "" {
                using var writer = context.CreateReplyWriter("s")
                writer.WriteString(if context.Request.PathAsString == ItemPath { ItemXml } else { MenuXml })
                context.Reply(writer.CreateMessage())
            } else if context.Request.InterfaceAsString == "org.freedesktop.DBus.Peer"
                && context.Request.MemberAsString == "Ping" && context.Request.SignatureAsString == "" {
                ReplyEmpty(context)
            } else if context.Request.PathAsString == ItemPath && context.Request.InterfaceAsString == ItemInterface {
                HandleItem(context)
            } else if context.Request.PathAsString == MenuPath && context.Request.InterfaceAsString == MenuInterface {
                HandleMenu(context)
            } else { context.ReplyUnknownMethodError() }
        } catch (error DBusMessageException) {
            context.ReplyError(InvalidArguments, "Invalid tray method arguments")
        } catch (error Exception) {
            icon.PostStatus(TrayStatus.Failed)
            context.HandleException(error, false)
            context.ReplyError("org.freedesktop.DBus.Error.Failed", "The tray method failed")
        }
        return ValueTask.CompletedTask
    }

    private func HandleItem(context MethodContext) {
        let member = context.Request.MemberAsString
        var reader = context.Request.GetBodyReader()
        if member == "ProvideXdgActivationToken" && context.Request.SignatureAsString == "s" {
            let bytes = reader.ReadStringAsSpan()
            if bytes.Length > ApplicationActivation.MaxNativeTokenBytes {
                context.ReplyError(InvalidArguments, "The activation token is too large")
                return
            }
            token = Encoding.UTF8.GetString(bytes)
            tokenSender = context.Request.SenderAsString
            ReplyEmpty(context)
        } else if (member == "Activate" || member == "SecondaryActivate")
            && context.Request.SignatureAsString == "ii" {
            reader.ReadInt32()
            reader.ReadInt32()
            icon.PostActivation(ConsumeToken(context.Request.SenderAsString))
            ReplyEmpty(context)
        } else if member == "ContextMenu" && context.Request.SignatureAsString == "ii" {
            reader.ReadInt32()
            reader.ReadInt32()
            if Volatile.Read(ref current).Root.Children.Length == 0 {
                context.ReplyError("org.freedesktop.DBus.Error.NotSupported", "This icon has no menu")
                return
            }
            using var writer = connection.GetMessageWriter()
            writer.WriteSignalHeader(MenuPath, MenuInterface, "ItemActivationRequested", "iu")
            writer.WriteInt32(0)
            writer.WriteUInt32(uint32(0))
            if connection.TrySendMessage(writer.CreateMessage()) { ReplyEmpty(context) }
            else { context.ReplyError("org.freedesktop.DBus.Error.Failed", "The menu host is unavailable") }
        } else if member == "Scroll" && context.Request.SignatureAsString == "is" {
            context.ReplyError("org.freedesktop.DBus.Error.NotSupported", "Tray icons do not expose a scroll action")
        } else { context.ReplyUnknownMethodError() }
    }

    private func ConsumeToken(sender string?) string? {
        let result = if sender == tokenSender { token } else { nil }
        token = nil
        tokenSender = nil
        return result
    }

    private func HandleProperties(context MethodContext) {
        let menu = context.Request.PathAsString == MenuPath
        let member = context.Request.MemberAsString
        if (member != "Get" || context.Request.SignatureAsString != "ss")
            && (member != "GetAll" || context.Request.SignatureAsString != "s") {
            context.ReplyUnknownMethodError()
            return
        }
        var reader = context.Request.GetBodyReader()
        let iface = reader.ReadString()
        if iface != (if menu { MenuInterface } else { ItemInterface }) {
            context.ReplyError(InvalidArguments, "Unknown tray interface")
            return
        }
        let state = Volatile.Read(ref current)
        if member == "Get" {
            let name = reader.ReadString()
            using var writer = context.CreateReplyWriter("v")
            if !WriteProperty(ref writer, state, menu, name) {
                context.ReplyError("org.freedesktop.DBus.Error.UnknownProperty", "Unknown tray property")
                return
            }
            context.Reply(writer.CreateMessage())
            return
        }
        using var writer = context.CreateReplyWriter("a{sv}")
        let entries = writer.WriteDictionaryStart()
        for name in (if menu { MenuProperties } else { ItemProperties }) {
            writer.WriteDictionaryEntryStart()
            writer.WriteString(name)
            WriteProperty(ref writer, state, menu, name)
        }
        writer.WriteDictionaryEnd(entries)
        context.Reply(writer.CreateMessage())
    }

    private func WriteProperty(ref writer MessageWriter, state LinuxTrayState, menu bool, name string) bool {
        if menu {
            if name == "Version" { writer.WriteVariantUInt32(uint32(3)) }
            else if name == "Status" { writer.WriteVariantString("normal") }
            else if name == "TextDirection" { writer.WriteVariantString(state.Direction) }
            else if name == "IconThemePath" {
                writer.WriteSignature("as")
                writer.WriteArray(Array.Empty[string]())
            } else { return false }
            return true
        }
        if name == "Category" { writer.WriteVariantString("ApplicationStatus") }
        else if name == "Id" { writer.WriteVariantString(state.Content.Id) }
        else if name == "Title" { writer.WriteVariantString(state.Content.Tooltip) }
        else if name == "Status" { writer.WriteVariantString("Active") }
        else if name == "WindowId" { writer.WriteVariantInt32(0) }
        else if name == "ItemIsMenu" { writer.WriteVariantBool(false) }
        else if name == "Menu" {
            writer.WriteSignature("o")
            writer.WriteObjectPath(MenuPath)
        } else if name == "IconPixmap" || name == "OverlayIconPixmap" || name == "AttentionIconPixmap" {
            writer.WriteSignature("a(iiay)")
            WritePixmap(ref writer, state, name == "IconPixmap")
        } else if name == "ToolTip" {
            writer.WriteSignature("(sa(iiay)ss)")
            writer.WriteStructureStart()
            writer.WriteString("")
            WritePixmap(ref writer, state, true)
            writer.WriteString(state.Content.Tooltip)
            writer.WriteString("")
        } else if name == "IconThemePath" || name == "IconName" || name == "OverlayIconName"
            || name == "AttentionIconName" || name == "AttentionMovieName" {
            writer.WriteVariantString("")
        } else { return false }
        return true
    }

    shared {
        private const InvalidArguments string = "org.freedesktop.DBus.Error.InvalidArgs"
        private let ItemProperties []string = [16]string{
            "Category", "Id", "Title", "Status", "WindowId", "ItemIsMenu", "Menu", "IconName", "IconPixmap",
            "IconThemePath", "OverlayIconName", "OverlayIconPixmap", "AttentionIconName", "AttentionIconPixmap",
            "AttentionMovieName", "ToolTip"
        }
        private let MenuProperties []string = [4]string{"Version", "Status", "TextDirection", "IconThemePath"}

        private const StandardXml string = "<interface name='org.freedesktop.DBus.Introspectable'>"
            + "<method name='Introspect'><arg type='s' direction='out'/></method></interface>"
            + "<interface name='org.freedesktop.DBus.Peer'><method name='Ping'/></interface>"
            + "<interface name='org.freedesktop.DBus.Properties'>"
            + "<method name='Get'><arg type='s' direction='in'/><arg type='s' direction='in'/>"
            + "<arg type='v' direction='out'/></method>"
            + "<method name='GetAll'><arg type='s' direction='in'/><arg type='a{sv}' direction='out'/></method>"
            + "</interface>"

        private const ItemXml string = "<node>" + StandardXml + "<interface name='org.kde.StatusNotifierItem'>"
            + "<property name='Category' type='s' access='read'/><property name='Id' type='s' access='read'/>"
            + "<property name='Title' type='s' access='read'/><property name='Status' type='s' access='read'/>"
            + "<property name='WindowId' type='i' access='read'/><property name='ItemIsMenu' type='b' access='read'/>"
            + "<property name='Menu' type='o' access='read'/><property name='IconName' type='s' access='read'/>"
            + "<property name='IconPixmap' type='a(iiay)' access='read'/>"
            + "<property name='IconThemePath' type='s' access='read'/>"
            + "<property name='OverlayIconName' type='s' access='read'/>"
            + "<property name='OverlayIconPixmap' type='a(iiay)' access='read'/>"
            + "<property name='AttentionIconName' type='s' access='read'/>"
            + "<property name='AttentionIconPixmap' type='a(iiay)' access='read'/>"
            + "<property name='AttentionMovieName' type='s' access='read'/>"
            + "<property name='ToolTip' type='(sa(iiay)ss)' access='read'/>"
            + "<method name='ProvideXdgActivationToken'><arg type='s' direction='in'/></method>"
            + "<method name='Activate'><arg type='i' direction='in'/><arg type='i' direction='in'/></method>"
            + "<method name='SecondaryActivate'><arg type='i' direction='in'/><arg type='i' direction='in'/></method>"
            + "<method name='ContextMenu'><arg type='i' direction='in'/><arg type='i' direction='in'/></method>"
            + "<method name='Scroll'><arg type='i' direction='in'/><arg type='s' direction='in'/></method>"
            + "<signal name='NewTitle'/><signal name='NewIcon'/><signal name='NewAttentionIcon'/>"
            + "<signal name='NewOverlayIcon'/><signal name='NewMenu'/><signal name='NewToolTip'/>"
            + "<signal name='NewStatus'><arg type='s'/></signal></interface><node name='Menu'/></node>"

        private const MenuXml string = "<node>" + StandardXml + "<interface name='com.canonical.dbusmenu'>"
            + "<property name='Version' type='u' access='read'/><property name='Status' type='s' access='read'/>"
            + "<property name='TextDirection' type='s' access='read'/>"
            + "<property name='IconThemePath' type='as' access='read'/>"
            + "<method name='GetLayout'><arg type='i' direction='in'/><arg type='i' direction='in'/>"
            + "<arg type='as' direction='in'/><arg type='u' direction='out'/>"
            + "<arg type='(ia{sv}av)' direction='out'/></method>"
            + "<method name='GetGroupProperties'><arg type='ai' direction='in'/><arg type='as' direction='in'/>"
            + "<arg type='a(ia{sv})' direction='out'/></method>"
            + "<method name='GetProperty'><arg type='i' direction='in'/><arg type='s' direction='in'/>"
            + "<arg type='v' direction='out'/></method>"
            + "<method name='Event'><arg type='i' direction='in'/><arg type='s' direction='in'/>"
            + "<arg type='v' direction='in'/><arg type='u' direction='in'/></method>"
            + "<method name='EventGroup'><arg type='a(isvu)' direction='in'/><arg type='ai' direction='out'/></method>"
            + "<method name='AboutToShow'><arg type='i' direction='in'/><arg type='b' direction='out'/></method>"
            + "<method name='AboutToShowGroup'><arg type='ai' direction='in'/><arg type='ai' direction='out'/>"
            + "<arg type='ai' direction='out'/></method>"
            + "<signal name='LayoutUpdated'><arg type='u'/><arg type='i'/></signal>"
            + "<signal name='ItemsPropertiesUpdated'><arg type='a(ia{sv})'/><arg type='a(ias)'/></signal>"
            + "<signal name='ItemActivationRequested'><arg type='i'/><arg type='u'/></signal></interface></node>"

        private func ReplyEmpty(context MethodContext) {
            using var writer = context.CreateReplyWriter()
            context.Reply(writer.CreateMessage())
        }

        private func WritePixmap(ref writer MessageWriter, state LinuxTrayState, include bool) {
            let array = writer.WriteArrayStart(DBusType.Struct)
            if include {
                writer.WriteStructureStart()
                writer.WriteInt32(state.Content.Width)
                writer.WriteInt32(state.Content.Height)
                writer.WriteArray(state.Argb)
            }
            writer.WriteArrayEnd(array)
        }
    }
}
