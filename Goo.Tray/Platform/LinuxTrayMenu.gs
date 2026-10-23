package Goo

import System
import System.Threading
import Tmds.DBus.Protocol

internal partial class LinuxTrayBackend {
    private func HandleMenu(context MethodContext) {
        let member = context.Request.MemberAsString
        let signature = context.Request.SignatureAsString
        let state = Volatile.Read(ref current)
        var reader = context.Request.GetBodyReader()
        if member == "GetLayout" && signature == "iias" {
            let id = reader.ReadInt32()
            let depth = reader.ReadInt32()
            let names = reader.ReadArrayOfString()
            if depth < -1 || !state.Nodes.TryGetValue(id, out var node) {
                context.ReplyError(InvalidArguments, "Unknown menu node or invalid depth")
                return
            }
            using var writer = context.CreateReplyWriter("u(ia{sv}av)")
            writer.WriteUInt32(state.Revision)
            WriteLayout(ref writer, node, depth, names)
            context.Reply(writer.CreateMessage())
        } else if member == "GetGroupProperties" && signature == "aias" {
            let ids = reader.ReadArrayOfInt32()
            let names = reader.ReadArrayOfString()
            using var writer = context.CreateReplyWriter("a(ia{sv})")
            let entries = writer.WriteArrayStart(DBusType.Struct)
            if ids.Length == 0 {
                for node in state.Nodes.Values { WriteGroupNode(ref writer, node, names) }
            } else {
                for id in ids {
                    if state.Nodes.TryGetValue(id, out var node) { WriteGroupNode(ref writer, node, names) }
                }
            }
            writer.WriteArrayEnd(entries)
            context.Reply(writer.CreateMessage())
        } else if member == "GetProperty" && signature == "is" {
            let id = reader.ReadInt32()
            let name = reader.ReadString()
            using var writer = context.CreateReplyWriter("v")
            if !state.Nodes.TryGetValue(id, out var node) || !WriteNodeProperty(ref writer, node, name) {
                context.ReplyError(InvalidArguments, "Unknown menu node or property")
                return
            }
            context.Reply(writer.CreateMessage())
        } else if member == "Event" && signature == "isvu" {
            let id = reader.ReadInt32()
            let action = reader.ReadString()
            reader.ReadVariantValue()
            reader.ReadUInt32()
            if !HandleMenuEvent(state, id, action, context.Request.SenderAsString) {
                context.ReplyError(InvalidArguments, "Unknown menu node")
                return
            }
            ReplyEmpty(context)
        } else if member == "EventGroup" && signature == "a(isvu)" {
            HandleEventGroup(context, state)
        } else if member == "AboutToShow" && signature == "i" {
            if !state.Nodes.ContainsKey(reader.ReadInt32()) {
                context.ReplyError(InvalidArguments, "Unknown menu node")
                return
            }
            using var writer = context.CreateReplyWriter("b")
            writer.WriteBool(false)
            context.Reply(writer.CreateMessage())
        } else if member == "AboutToShowGroup" && signature == "ai" {
            HandleAboutGroup(context, state)
        } else { context.ReplyUnknownMethodError() }
    }

    private func HandleMenuEvent(state LinuxTrayState, id int32, action string, sender string?) bool {
        if !state.Nodes.TryGetValue(id, out var node) { return false }
        if action == "clicked" {
            let activation = ConsumeToken(sender)
            if let item = node.Item {
                if node.Enabled && !item.Separator && node.Children.Length == 0 { icon.PostCommand(item.Id, activation) }
            }
        }
        return true
    }

    private func HandleEventGroup(context MethodContext, state LinuxTrayState) {
        var reader = context.Request.GetBodyReader()
        let events = reader.ReadArrayStart(DBusType.Struct)
        let sender = context.Request.SenderAsString
        using var writer = context.CreateReplyWriter("ai")
        let errors = writer.WriteArrayStart(DBusType.Int32)
        var received = 0
        var found = 0
        while reader.HasNext(events) {
            reader.AlignStruct()
            let id = reader.ReadInt32()
            let action = reader.ReadString()
            reader.ReadVariantValue()
            reader.ReadUInt32()
            received++
            if HandleMenuEvent(state, id, action, sender) { found++ }
            else { writer.WriteInt32(id) }
        }
        writer.WriteArrayEnd(errors)
        if received > 0 && found == 0 {
            context.ReplyError(InvalidArguments, "No requested menu nodes exist")
            return
        }
        context.Reply(writer.CreateMessage())
    }

    private func HandleAboutGroup(context MethodContext, state LinuxTrayState) {
        var reader = context.Request.GetBodyReader()
        let ids = reader.ReadArrayStart(DBusType.Int32)
        using var writer = context.CreateReplyWriter("aiai")
        writer.WriteArray(Array.Empty[int32]())
        let errors = writer.WriteArrayStart(DBusType.Int32)
        var received = 0
        var found = 0
        while reader.HasNext(ids) {
            let id = reader.ReadInt32()
            received++
            if state.Nodes.ContainsKey(id) { found++ }
            else { writer.WriteInt32(id) }
        }
        writer.WriteArrayEnd(errors)
        if received > 0 && found == 0 {
            context.ReplyError(InvalidArguments, "No requested menu nodes exist")
            return
        }
        context.Reply(writer.CreateMessage())
    }

    shared {
        private let NodeProperties []string = [11]string{
            "type", "label", "enabled", "visible", "icon-name", "icon-data", "shortcut", "toggle-type",
            "toggle-state", "children-display", "disposition"
        }

        private func WriteLayout(ref writer MessageWriter, node LinuxTrayNode, depth int32, names []string) {
            writer.WriteStructureStart()
            writer.WriteInt32(node.Id)
            WriteNodeProperties(ref writer, node, names)
            let children = writer.WriteArrayStart(DBusType.Variant)
            if depth != 0 {
                for child in node.Children {
                    writer.WriteSignature("(ia{sv}av)")
                    WriteLayout(ref writer, child, if depth < 0 { -1 } else { depth - 1 }, names)
                }
            }
            writer.WriteArrayEnd(children)
        }

        private func WriteGroupNode(ref writer MessageWriter, node LinuxTrayNode, names []string) {
            writer.WriteStructureStart()
            writer.WriteInt32(node.Id)
            WriteNodeProperties(ref writer, node, names)
        }

        private func WriteNodeProperties(ref writer MessageWriter, node LinuxTrayNode, names []string) {
            let entries = writer.WriteDictionaryStart()
            for name in NodeProperties {
                if names.Length != 0 && Array.IndexOf(names, name) < 0 { continue }
                writer.WriteDictionaryEntryStart()
                writer.WriteString(name)
                WriteNodeProperty(ref writer, node, name)
            }
            writer.WriteDictionaryEnd(entries)
        }

        private func WriteNodeProperty(ref writer MessageWriter, node LinuxTrayNode, name string) bool {
            let item = node.Item
            if name == "type" { writer.WriteVariantString(if item?.Separator == true { "separator" } else { "standard" }) }
            else if name == "label" { writer.WriteVariantString(node.Label) }
            else if name == "enabled" { writer.WriteVariantBool(node.Enabled) }
            else if name == "visible" { writer.WriteVariantBool(true) }
            else if name == "icon-name" { writer.WriteVariantString("") }
            else if name == "icon-data" {
                writer.WriteSignature("ay")
                writer.WriteArray(Array.Empty[uint8]())
            } else if name == "children-display" {
                writer.WriteVariantString(if node.Children.Length > 0 { "submenu" } else { "" })
            } else if name == "toggle-type" {
                writer.WriteVariantString(if item?.Checked == true { "checkmark" } else { "" })
            } else if name == "toggle-state" {
                writer.WriteVariantInt32(if item?.Checked == true { 1 } else { -1 })
            } else if name == "disposition" { writer.WriteVariantString("normal") }
            else if name == "shortcut" { WriteShortcut(ref writer, item?.Shortcut) }
            else { return false }
            return true
        }

        private func WriteShortcut(ref writer MessageWriter, shortcut NativeMenuShortcut?) {
            writer.WriteSignature("aas")
            let keys = writer.WriteArrayStart(DBusType.Array)
            if let value = shortcut {
                let chord = writer.WriteArrayStart(DBusType.String)
                if value.Modifiers.Ctrl { writer.WriteString("Control") }
                if value.Modifiers.Alt { writer.WriteString("Alt") }
                if value.Modifiers.Shift { writer.WriteString("Shift") }
                if value.Modifiers.Super { writer.WriteString("Super") }
                writer.WriteString(value.Key)
                writer.WriteArrayEnd(chord)
            }
            writer.WriteArrayEnd(keys)
        }
    }
}
