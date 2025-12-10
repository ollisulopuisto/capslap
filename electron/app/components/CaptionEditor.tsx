import React, { useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { ArrowLeft, ArrowRight, Play, Save, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface WordSpan {
    startMs: number
    endMs: number
    text: string
}

export interface CaptionSegment {
    startMs: number
    endMs: number
    text: string
    words: WordSpan[]
}

interface CaptionEditorProps {
    initialSegments: CaptionSegment[]
    onBurn: (segments: CaptionSegment[]) => void
    onCancel: () => void
    videoPath: string
}

export function CaptionEditor({ initialSegments, onBurn, onCancel, videoPath }: CaptionEditorProps) {
    const [segments, setSegments] = useState<CaptionSegment[]>(initialSegments)

    // Move the last word of segment[index] to the beginning of segment[index+1]
    const moveLastWordToNext = (index: number) => {
        if (index < 0 || index >= segments.length - 1) return

        const current = segments[index]
        const next = segments[index + 1]

        if (current.words.length === 0) return

        const wordToMove = current.words[current.words.length - 1]

        const newCurrentWords = current.words.slice(0, -1)
        const newNextWords = [wordToMove, ...next.words]

        // Calculate new timings
        // Current segment ends at the new last word's end, or its original start if empty
        const newCurrentEndMs = newCurrentWords.length > 0
            ? newCurrentWords[newCurrentWords.length - 1].endMs
            : current.startMs

        // Next segment starts at the moved word's start
        const newNextStartMs = wordToMove.startMs

        const newCurrent: CaptionSegment = {
            ...current,
            words: newCurrentWords,
            text: newCurrentWords.map(w => w.text).join(' '),
            endMs: newCurrentEndMs
        }

        const newNext: CaptionSegment = {
            ...next,
            words: newNextWords,
            text: newNextWords.map(w => w.text).join(' '),
            startMs: newNextStartMs
        }

        const newSegments = [...segments]
        newSegments[index] = newCurrent
        newSegments[index + 1] = newNext

        // If current becomes empty, remove it?
        // Let's remove it to keep the UI clean
        if (newCurrent.words.length === 0) {
            newSegments.splice(index, 1)
        }

        setSegments(newSegments)
    }

    return (
        <div className="flex flex-col h-full bg-[#08090a] text-white p-6 gap-6 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <h2 className="text-xl font-medium">Edit Captions</h2>
                <div className="flex gap-2">
                    <Button variant="ghost" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button onClick={() => onBurn(segments)} className="bg-primary hover:bg-primary/90">
                        <Save className="w-4 h-4 mr-2" />
                        Burn & Export
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {segments.map((seg, idx) => (
                    <div key={idx} className="bg-card/30 border border-border/30 rounded-lg p-4 flex items-center gap-4 group hover:border-primary/30 transition-colors">
                        {/* Timestamp */}
                        <div className="text-xs font-mono text-muted-foreground w-20 flex-shrink-0">
                            {formatTime(seg.startMs)}
                            <br />
                            {formatTime(seg.endMs)}
                        </div>

                        {/* Words */}
                        <div className="flex-1 flex flex-wrap gap-1.5">
                            {seg.words.map((word, wIdx) => (
                                <span
                                    key={wIdx}
                                    className="px-2 py-1 bg-white/5 rounded text-sm border border-white/10 hover:bg-white/10 cursor-default"
                                    title={`${formatTime(word.startMs)} - ${formatTime(word.endMs)}`}
                                >
                                    {word.text}
                                </span>
                            ))}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {/* Pull from Prev = Move last of Prev to Here = moveLastWordToNext(idx-1) */}
                            <Button
                                variant="secondary"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                disabled={idx === 0 || segments[idx - 1].words.length === 0}
                                onClick={() => moveLastWordToNext(idx - 1)}
                            >
                                <ArrowLeft className="w-3 h-3 mr-1" />
                                Pull from Prev
                            </Button>

                            {/* Push to Next = Move last of Here to Next = moveLastWordToNext(idx) */}
                            <Button
                                variant="secondary"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                disabled={idx === segments.length - 1 || seg.words.length === 0}
                                onClick={() => moveLastWordToNext(idx)}
                            >
                                Push to Next
                                <ArrowRight className="w-3 h-3 ml-1" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function formatTime(ms: number) {
    const s = ms / 1000
    const minutes = Math.floor(s / 60)
    const seconds = Math.floor(s % 60)
    const millis = Math.floor((s % 1) * 100)
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(2, '0')}`
}
