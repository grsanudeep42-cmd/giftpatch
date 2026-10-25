import React, { useEffect, useRef, useState, useCallback } from 'react'
import QRCode from 'qrcode'
import { Download, Share2, RefreshCw, Gift, Clock } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { getAdapter } from '../../lib/get-adapter'
import { Navbar } from '../../components/Navbar'
import { DemoBanner } from '../../components/ui/DemoBanner'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { PageLoader } from '../../components/ui/LoadingStates'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../contexts/ToastContext'
import { APP_NAME, EVENT_NAME, IS_DEMO_MODE } from '../../constants'
import { formatDateTime } from '../../utils'
import type { Participant } from '../../types'

export function AttendePassPage() {
  const { session, refreshSession } = useAuth()
  const { toast } = useToast()
  const adapter = getAdapter()
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)
  const passRef = useRef<HTMLDivElement>(null)

  const [participant, setParticipant] = useState<Participant | null>(
    session?.participant ?? null
  )
  const [loading, setLoading] = useState(!session?.participant)
  const [error, setError] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')

  const loadParticipant = useCallback(async () => {
    if (!session?.user.id) return
    try {
      const p = await adapter.getMyParticipant(session.user.id)
      setParticipant(p)
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [session, adapter])

  useEffect(() => {
    if (!session?.participant) {
      loadParticipant()
    } else {
      setLoading(false)
    }
  }, [session, loadParticipant])

  // Render QR code
  useEffect(() => {
    if (!participant?.qr_token) return
    QRCode.toDataURL(participant.qr_token, {
      width: 300,
      margin: 2,
      color: { dark: '#111C2D', light: '#FFFFFF' },
      errorCorrectionLevel: 'H',
    }).then(setQrDataUrl)
  }, [participant?.qr_token])

  const handleDownload = async () => {
    if (!qrDataUrl || !participant) return
    const link = document.createElement('a')
    link.href = qrDataUrl
    link.download = `GiftPass-${participant.participant_id}.png`
    link.click()
    toast('QR code downloaded', 'success')
  }

  const handleShare = async () => {
    if (!participant) return
    try {
      await navigator.share({
        title: `${APP_NAME} — ${participant.name}`,
        text: `My gift pass for ${EVENT_NAME}. Participant ID: ${participant.participant_id}`,
      })
    } catch {
      toast('Share not available on this device. Please screenshot the pass.', 'info')
    }
  }

  if (loading) return <PageLoader />

  if (error) {
    return (
      <div className="min-h-dvh bg-cloud">
        <DemoBanner />
        <Navbar title="My Gift Pass" />
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="text-center">
            <div className="alert-error max-w-sm mb-4">
              <Gift className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
            <Button variant="secondary" onClick={loadParticipant} icon={<RefreshCw className="h-4 w-4" />}>
              Retry
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!participant) return null

  const isCollected = participant.gift_status === 'collected'

  return (
    <div className="min-h-dvh bg-cloud">
      <DemoBanner />
      <Navbar title="My Gift Pass" />

      <div className="mx-auto max-w-sm px-4 py-6">
        {/* The Pass */}
        <div
          ref={passRef}
          className="card overflow-hidden shadow-card-lg"
          role="region"
          aria-label="Gift Pass"
        >
          {/* Pass header */}
          <div className="bg-gradient-to-br from-brand-teal to-brand-teal-dark p-5 text-white">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                <Gift className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-teal-100 uppercase tracking-wider">{APP_NAME}</p>
                <p className="text-xs text-teal-200">{EVENT_NAME}</p>
              </div>
            </div>
            <h2 className="text-xl font-extrabold truncate">{participant.name}</h2>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold font-mono tracking-wide">
                {participant.participant_id}
              </span>
              <StatusBadge status={participant.gift_status} size="sm" />
            </div>
          </div>

          {/* QR code section */}
          <div className="p-5">
            {isCollected ? (
              <div className="flex flex-col items-center py-6 gap-3">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
                  <Gift className="h-10 w-10 text-green-600" />
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-green-700">Gift Collected!</p>
                  <p className="text-sm text-gray-500 mt-1">Your gift has been issued.</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                {qrDataUrl ? (
                  <div className="relative">
                    <img
                      src={qrDataUrl}
                      alt={`QR code for participant ${participant.participant_id}`}
                      className="h-56 w-56 rounded-xl border-4 border-gray-100 shadow-inner"
                    />
                  </div>
                ) : (
                  <div className="h-56 w-56 rounded-xl bg-gray-100 animate-pulse" />
                )}
                <div className="text-center">
                  <p className="text-sm font-semibold text-ink">Present this pass at the gift counter</p>
                  <p className="text-xs text-gray-500 mt-1">Staff will scan your QR code</p>
                </div>
              </div>
            )}

            {/* Instructions */}
            {!isCollected && (
              <div className="mt-4 rounded-xl bg-teal-50 border border-teal-100 p-3">
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 text-brand-teal mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-teal-800">
                    Keep this screen open and show it to the gift staff. Ensure your screen is bright enough to scan.
                  </p>
                </div>
              </div>
            )}

            {IS_DEMO_MODE && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs text-amber-700 font-mono">
                  Demo token: {participant.qr_token.slice(0, 30)}…
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        {!isCollected && (
          <div className="mt-4 flex gap-3">
            <Button
              variant="secondary"
              fullWidth
              onClick={handleDownload}
              icon={<Download className="h-4 w-4" />}
              disabled={!qrDataUrl}
            >
              Save QR
            </Button>
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <Button
                variant="secondary"
                fullWidth
                onClick={handleShare}
                icon={<Share2 className="h-4 w-4" />}
              >
                Share
              </Button>
            )}
          </div>
        )}

        <Button
          variant="ghost"
          fullWidth
          onClick={loadParticipant}
          icon={<RefreshCw className="h-4 w-4" />}
          className="mt-3"
        >
          Refresh Status
        </Button>
      </div>
    </div>
  )
}
