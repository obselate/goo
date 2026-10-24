package Goo

import System
import System.Collections.Generic
import System.Globalization

internal class LinuxTrayNode {
    internal let Id int32
    internal let Item NativeMenuItem?
    internal let Children []LinuxTrayNode
    internal let Enabled bool
    internal let Label string

    internal init(id int32, item NativeMenuItem?, enabled bool, children []LinuxTrayNode) {
        Id = id
        Item = item
        Enabled = enabled
        Children = children
        Label = item?.Text.Replace("_", "__", StringComparison.Ordinal) ?? ""
    }
}

internal class LinuxTrayState {
    internal let Content TrayContent
    internal let Argb []uint8
    internal let Revision uint32
    internal let Direction string
    internal let Nodes Dictionary[int32, LinuxTrayNode]
    internal let Ids Dictionary[string, int32]
    internal let Root LinuxTrayNode

    internal init(content TrayContent, pixels IReadOnlyList[uint8], previous LinuxTrayState?, ref nextId int32) {
        Content = content
        Direction = if CultureInfo.CurrentUICulture.TextInfo.IsRightToLeft { "rtl" } else { "ltr" }
        Argb = [pixels.Count]uint8
        for index in 0 ... content.Width * content.Height {
            let offset = index * 4
            Argb[offset] = pixels[offset + 3]
            Argb[offset + 1] = pixels[offset]
            Argb[offset + 2] = pixels[offset + 1]
            Argb[offset + 3] = pixels[offset + 2]
        }
        Revision = if previous == nil { uint32(1) } else { previous.Revision + uint32(1) }
        Nodes = Dictionary[int32, LinuxTrayNode]()
        Ids = Dictionary[string, int32](StringComparer.Ordinal)
        Root = LinuxTrayNode(0, nil, true, Build(content.Menu.Items, true, previous, ref nextId))
        Nodes.Add(0, Root)
    }

    private func Build(items IReadOnlyList[NativeMenuItem], enabled bool, previous LinuxTrayState?,
        ref nextId int32) []LinuxTrayNode {
        if items.Count == 0 { return Array.Empty[LinuxTrayNode]() }
        let nodes = [items.Count]LinuxTrayNode
        for index in 0 ... items.Count {
            let item = items[index]
            var id int32
            if item.Separator || previous == nil || !previous.Ids.TryGetValue(item.Id, out id) {
                if nextId == int32.MaxValue { throw OverflowException("The tray menu identity space is exhausted") }
                nextId++
                id = nextId
            }
            if !item.Separator { Ids.Add(item.Id, id) }
            let active = enabled && item.Enabled
            let node = LinuxTrayNode(id, item, active, Build(item.Items, active, previous, ref nextId))
            nodes[index] = node
            Nodes.Add(id, node)
        }
        return nodes
    }
}
