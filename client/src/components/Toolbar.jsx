import { useEditorState } from '@tiptap/react';
import {
  Bold, Code, Italic, List, ListOrdered, Minus, Quote, Redo2, RemoveFormatting, Strikethrough, Underline, Undo2,
} from 'lucide-react';

const BLOCK_STYLES = [
  { value: 'p', label: 'Normal text' },
  { value: 'h1', label: 'Heading 1' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
];

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl+';

function Btn({ icon: Icon, active, label, onClick, disabled }) {
  return (
    <button
      type="button" className={`tool${active ? ' active' : ''}`} onClick={onClick} disabled={disabled}
      title={label} aria-label={label} aria-pressed={active ?? undefined}
      onMouseDown={(e) => e.preventDefault()} // keep the editor selection
    >
      <Icon size={15} strokeWidth={2} />
    </button>
  );
}

export default function Toolbar({ editor }) {
  // Re-render only when the formatting state under the cursor changes.
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive('heading', { level: 1 }) ? 'h1' : e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : 'p',
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();
  const setBlock = (value) => (value === 'p' ? chain().setParagraph().run() : chain().setHeading({ level: Number(value[1]) }).run());

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <Btn icon={Undo2} label={`Undo (${mod}Z)`} onClick={() => chain().undo().run()} disabled={!s.canUndo} />
      <Btn icon={Redo2} label={`Redo (${mod}Shift+Z)`} onClick={() => chain().redo().run()} disabled={!s.canRedo} />
      <span className="tool-sep" />
      <select className="tool-select" value={s.block} onChange={(e) => setBlock(e.target.value)} aria-label="Text style">
        {BLOCK_STYLES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
      </select>
      <span className="tool-sep" />
      <Btn icon={Bold} label={`Bold (${mod}B)`} active={s.bold} onClick={() => chain().toggleBold().run()} />
      <Btn icon={Italic} label={`Italic (${mod}I)`} active={s.italic} onClick={() => chain().toggleItalic().run()} />
      <Btn icon={Underline} label={`Underline (${mod}U)`} active={s.underline} onClick={() => chain().toggleUnderline().run()} />
      <Btn icon={Strikethrough} label="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()} />
      <Btn icon={Code} label="Inline code" active={s.code} onClick={() => chain().toggleCode().run()} />
      <span className="tool-sep" />
      <Btn icon={List} label="Bulleted list" active={s.bullet} onClick={() => chain().toggleBulletList().run()} />
      <Btn icon={ListOrdered} label="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()} />
      <Btn icon={Quote} label="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()} />
      <Btn icon={Minus} label="Divider" onClick={() => chain().setHorizontalRule().run()} />
      <span className="tool-sep" />
      <Btn icon={RemoveFormatting} label="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()} />
    </div>
  );
}
