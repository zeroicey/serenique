// 事件卡片：时间列（全天徽标 / 时段 / 跨日）+ 标题/地点/备注 + ⋯ 菜单（编辑/删除）。
// 删除确认由调用方（页面）负责，本组件只发 onDelete 回调。
import 'package:flutter/material.dart';
import '../event_models.dart';
import '../event_time.dart';

class EventTile extends StatefulWidget {
  const EventTile({
    super.key,
    required this.event,
    required this.onEdit,
    required this.onDelete,
  });

  final EventEntry event;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  State<EventTile> createState() => _EventTileState();
}

class _EventTileState extends State<EventTile> {
  static const _noteTruncate = 150;
  bool _noteExpanded = false;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final e = widget.event;
    final note = e.note ?? '';
    final showToggle = note.length > _noteTruncate;
    final shownNote = showToggle && !_noteExpanded ? '${note.substring(0, _noteTruncate)}…' : note;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 104,
            child: e.isAllDay
                ? Align(
                    alignment: Alignment.centerLeft,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: scheme.secondaryContainer,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text('全天',
                          style: TextStyle(fontSize: 12, color: scheme.onSecondaryContainer)),
                    ),
                  )
                : Text(
                    eventTimeLabel(e),
                    style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant, height: 1.3),
                  ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(e.title,
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                    ),
                    PopupMenuButton<String>(
                      tooltip: '日程操作',
                      onSelected: (v) => v == 'edit' ? widget.onEdit() : widget.onDelete(),
                      itemBuilder: (_) => const [
                        PopupMenuItem(value: 'edit', child: Text('编辑')),
                        PopupMenuItem(value: 'delete', child: Text('删除')),
                      ],
                    ),
                  ],
                ),
                if (e.location != null && e.location!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Row(children: [
                      Icon(Icons.place_outlined, size: 13, color: scheme.onSurfaceVariant),
                      const SizedBox(width: 3),
                      Expanded(
                        child: Text(e.location!,
                            style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                      ),
                    ]),
                  ),
                if (shownNote.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(shownNote,
                        style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant, height: 1.4)),
                  ),
                if (showToggle)
                  GestureDetector(
                    onTap: () => setState(() => _noteExpanded = !_noteExpanded),
                    child: Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(_noteExpanded ? '收起' : '展开',
                          style: TextStyle(fontSize: 12, color: scheme.primary)),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
