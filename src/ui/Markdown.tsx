import React, { useMemo } from 'react'
import { Box, Text } from 'ink'

// ─── Types ───
type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; language?: string; content: string }
  | { type: 'list'; items: string[]; ordered: boolean }
  | { type: 'blockquote'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'divider' }
  | { type: 'text'; text: string }

type Props = {
  text: string
  terminalWidth?: number
}

// ─── Main Component ───
export function Markdown({ text, terminalWidth = 80 }: Props) {
  const blocks = useMemo(() => parseMarkdown(text), [text])

  return (
    <Box flexDirection="column">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} terminalWidth={terminalWidth} />
      ))}
    </Box>
  )
}

// ─── Block Renderer ───
function BlockView({ block, terminalWidth }: { block: Block; terminalWidth: number }) {
  switch (block.type) {
    case 'heading': {
      const indent = '  '.repeat(Math.max(0, block.level - 1))
      const color = block.level === 1 ? 'cyan' : block.level === 2 ? 'yellow' : 'white'
      return (
        <Box marginBottom={1}>
          <Text bold color={color}>{indent}{block.text}</Text>
        </Box>
      )
    }

    case 'paragraph': {
      const lines = wrapText(stripMarkdown(block.text), terminalWidth - 2)
      return (
        <Box flexDirection="column" marginBottom={1}>
          {lines.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </Box>
      )
    }

    case 'code': {
      const maxCodeWidth = Math.min(terminalWidth - 4, 100)
      const lines = block.content.split('\n').map(l =>
        l.length > maxCodeWidth ? l.slice(0, maxCodeWidth - 3) + '...' : l
      )
      // Limit to 20 lines with indicator
      const displayLines = lines.length > 20
        ? [...lines.slice(0, 18), `// ... ${lines.length - 18} more lines`]
        : lines

      return (
        <Box flexDirection="column" marginBottom={1}>
          {block.language && (
            <Text dimColor>  {block.language}</Text>
          )}
          <Box borderStyle="single" borderColor="gray" paddingLeft={1} paddingRight={1}>
            <Box flexDirection="column">
              {displayLines.map((line, i) => (
                <Text key={i} dimColor>{line || ' '}</Text>
              ))}
            </Box>
          </Box>
        </Box>
      )
    }

    case 'list': {
      return (
        <Box flexDirection="column" marginBottom={1}>
          {block.items.map((item, i) => {
            const prefix = block.ordered ? `${i + 1}.` : '•'
            const lines = wrapText(stripMarkdown(item), terminalWidth - 6)
            return (
              <Box key={i} flexDirection="column">
                <Box>
                  <Text dimColor>  {prefix} </Text>
                  <Text>{lines[0]}</Text>
                </Box>
                {lines.slice(1).map((line, j) => (
                  <Box key={j} marginLeft={4}>
                    <Text>{line}</Text>
                  </Box>
                ))}
              </Box>
            )
          })}
        </Box>
      )
    }

    case 'blockquote': {
      const lines = wrapText(block.text, terminalWidth - 4)
      return (
        <Box flexDirection="column" marginBottom={1} marginLeft={1}>
          {lines.map((line, i) => (
            <Box key={i}>
              <Text color="yellow">  │ </Text>
              <Text dimColor>{line}</Text>
            </Box>
          ))}
        </Box>
      )
    }

    case 'table': {
      return (
        <Box flexDirection="column" marginBottom={1}>
          <TableView
            headers={block.headers}
            rows={block.rows}
            terminalWidth={terminalWidth}
          />
        </Box>
      )
    }

    case 'divider':
      return (
        <Box marginBottom={1}>
          <Text dimColor>{'─'.repeat(Math.min(terminalWidth - 2, 60))}</Text>
        </Box>
      )

    case 'text': {
      const lines = wrapText(block.text, terminalWidth - 2)
      return (
        <Box flexDirection="column">
          {lines.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </Box>
      )
    }

    default:
      return null
  }
}

// ─── Table Renderer ───
function TableView({ headers, rows, terminalWidth }: {
  headers: string[]
  rows: string[][]
  terminalWidth: number
}) {
  // Calculate max width per column
  const colWidths = headers.map((h, i) => {
    const maxContent = Math.max(
      stripMarkdown(h).length,
      ...rows.map(r => stripMarkdown(r[i] || '').length)
    )
    return Math.min(maxContent, 30) // Cap at 30 chars per cell
  })

  const totalWidth = colWidths.reduce((a, b) => a + b + 3, 1) // +3 for " │ ", +1 for edge

  // If table is too wide, truncate columns or simplify
  if (totalWidth > terminalWidth - 2) {
    // Render as compact key-value pairs instead
    return (
      <Box flexDirection="column">
        {rows.map((row, i) => (
          <Box key={i} flexDirection="column" marginBottom={1}>
            {row.map((cell, j) => {
              const header = headers[j] || `Col ${j + 1}`
              return (
                <Box key={j}>
                  <Text dimColor>  {header}: </Text>
                  <Text>{stripMarkdown(cell).slice(0, terminalWidth - header.length - 6)}</Text>
                </Box>
              )
            })}
          </Box>
        ))}
      </Box>
    )
  }

  // Render as proper table
  const renderRow = (cells: string[], isHeader = false) => (
    <Box>
      <Text dimColor>│</Text>
      {cells.map((cell, i) => {
        const clean = stripMarkdown(cell)
        const padded = clean.padEnd(colWidths[i]).slice(0, colWidths[i])
        return (
          <React.Fragment key={i}>
            <Text>{isHeader ? <Text bold>{padded}</Text> : padded}</Text>
            <Text dimColor>│</Text>
          </React.Fragment>
        )
      })}
    </Box>
  )

  const separator = '┼' + colWidths.map(w => '─'.repeat(w + 2)).join('┼') + '┼'

  return (
    <Box flexDirection="column">
      <Text dimColor>┌{colWidths.map(w => '─'.repeat(w + 2)).join('┬')}┐</Text>
      {renderRow(headers, true)}
      <Text dimColor>{separator}</Text>
      {rows.map((row, i) => (
        <React.Fragment key={i}>
          {renderRow(row)}
        </React.Fragment>
      ))}
      <Text dimColor>└{colWidths.map(w => '─'.repeat(w + 2)).join('┴')}┘</Text>
    </Box>
  )
}

// ─── Markdown Parser ───
function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = []
  const lines = text.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Skip empty lines
    if (!line.trim()) {
      i++
      continue
    }

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      i++
      const content: string[] = []
      while (i < lines.length && !lines[i].startsWith('```')) {
        content.push(lines[i])
        i++
      }
      blocks.push({ type: 'code', language: lang || undefined, content: content.join('\n') })
      i++ // skip closing ```
      continue
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && lines[i + 1].includes('─')) {
      const headerLine = line
      const headers = headerLine.split('|').map(s => s.trim()).filter(s => s)
      i += 2 // skip header and separator
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|')) {
        const cells = lines[i].split('|').map(s => s.trim()).filter(s => s)
        if (cells.length > 0) rows.push(cells)
        i++
      }
      blocks.push({ type: 'table', headers, rows })
      continue
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: stripMarkdown(headingMatch[2]),
      })
      i++
      continue
    }

    // Horizontal rule
    if (/^(---|___|\*\*\*)$/.test(line.trim())) {
      blocks.push({ type: 'divider' })
      i++
      continue
    }

    // Blockquote
    if (line.startsWith('>')) {
      const text = line.slice(1).trim()
      i++
      // Collect continuation lines
      while (i < lines.length && lines[i].startsWith('>')) {
        // also handle > at start of wrapped lines
      }
      blocks.push({ type: 'blockquote', text: stripMarkdown(text) })
      continue
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s*/, ''))
        i++
      }
      blocks.push({ type: 'list', items: items.map(stripMarkdown), ordered: true })
      continue
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s*/, ''))
        i++
      }
      blocks.push({ type: 'list', items: items.map(stripMarkdown), ordered: false })
      continue
    }

    // Regular paragraph
    const paragraph: string[] = [line]
    i++
    while (i < lines.length && lines[i].trim() && !isSpecialLine(lines[i])) {
      paragraph.push(lines[i])
      i++
    }
    blocks.push({ type: 'paragraph', text: stripMarkdown(paragraph.join(' ')) })
  }

  return blocks
}

function isSpecialLine(line: string): boolean {
  return (
    line.startsWith('```') ||
    line.startsWith('#') ||
    line.startsWith('>') ||
    /^\d+\.\s/.test(line) ||
    /^[-*+]\s/.test(line) ||
    /^(---|___|\*\*\*)$/.test(line.trim()) ||
    (line.includes('|') && line.replace(/[^|]/g, '').length >= 2)
  )
}

// ─── Text Utilities ───

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')   // bold
    .replace(/\*(.+?)\*/g, '$1')       // italic
    .replace(/`(.+?)`/g, '$1')         // inline code
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
    .replace(/~~(.+?)~~/g, '$1')       // strikethrough
    .replace(/\|/g, '')                // table pipes
    .trim()
}

function wrapText(text: string, maxWidth: number): string[] {
  if (!text) return ['']
  if (text.length <= maxWidth) return [text]

  const words = text.split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    if ((current + ' ' + word).trim().length <= maxWidth) {
      current = current ? current + ' ' + word : word
    } else {
      if (current) lines.push(current)
      // If single word exceeds maxWidth, break it
      if (word.length > maxWidth) {
        let remaining = word
        while (remaining.length > maxWidth) {
          lines.push(remaining.slice(0, maxWidth))
          remaining = remaining.slice(maxWidth)
        }
        current = remaining
      } else {
        current = word
      }
    }
  }

  if (current) lines.push(current)
  return lines.length ? lines : ['']
}
