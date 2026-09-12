import type { ReactNode } from 'react'

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const token = match[0]
    if (token.startsWith('**')) {
      parts.push(
        <strong key={key} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      )
    } else if (token.startsWith('*')) {
      parts.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      )
    } else {
      parts.push(
        <code key={key} className="rounded bg-background/80 px-1 py-0.5 font-mono text-[0.7rem]">
          {token.slice(1, -1)}
        </code>,
      )
    }
    key += 1
    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

type Block =
  | { type: 'p'; text: string }
  | { type: 'ul' | 'ol'; items: string[] }

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null

  const flushList = () => {
    if (list) {
      blocks.push(list)
      list = null
    }
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flushList()
      continue
    }

    const unordered = line.match(/^[-*•]\s+(.+)$/)
    const ordered = line.match(/^\d+[.)]\s+(.+)$/)

    if (unordered) {
      if (!list || list.type !== 'ul') {
        flushList()
        list = { type: 'ul', items: [] }
      }
      list.items.push(unordered[1])
      continue
    }

    if (ordered) {
      if (!list || list.type !== 'ol') {
        flushList()
        list = { type: 'ol', items: [] }
      }
      list.items.push(ordered[1])
      continue
    }

    flushList()
    const heading = line.replace(/^#{1,3}\s+/, '')
    blocks.push({ type: 'p', text: heading })
  }

  flushList()
  return blocks
}

export function ChatMarkdown({ content }: { content: string }) {
  const blocks = parseBlocks(content)

  return (
    <div className="space-y-1.5 text-xs leading-relaxed">
      {blocks.map((block, index) => {
        if (block.type === 'p') {
          return (
            <p key={index} className="text-inherit">
              {renderInline(block.text)}
            </p>
          )
        }

        const ListTag = block.type === 'ol' ? 'ol' : 'ul'
        return (
          <ListTag
            key={index}
            className={
              block.type === 'ol'
                ? 'list-decimal space-y-0.5 pl-4'
                : 'list-disc space-y-0.5 pl-4'
            }
          >
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{renderInline(item)}</li>
            ))}
          </ListTag>
        )
      })}
    </div>
  )
}
