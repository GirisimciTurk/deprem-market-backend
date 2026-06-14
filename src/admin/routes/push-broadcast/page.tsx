import React, { useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Container,
  Heading,
  Text,
  Input,
  Textarea,
  Button,
  Label,
} from "@medusajs/ui"

const BellIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
)

const PushBroadcastPage = () => {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [url, setUrl] = useState("/")
  const [image, setImage] = useState("")
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  const send = async () => {
    if (!title.trim() || !body.trim()) {
      setStatus({ type: "error", text: "Başlık ve metin zorunludur." })
      return
    }
    setSending(true)
    setStatus(null)
    try {
      const res = await fetch("/admin/push/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          url: url.trim() || "/",
          image: image.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.message || "Gönderim başarısız.")
      }
      setStatus({
        type: "success",
        text: `Bildirim gönderildi — ${data.sent}/${data.total} aboneye ulaştı.`,
      })
      setTitle("")
      setBody("")
      setImage("")
    } catch (err: any) {
      setStatus({ type: "error", text: err?.message || "Bir hata oluştu." })
    } finally {
      setSending(false)
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center gap-x-3 px-6 py-4">
        <BellIcon />
        <div>
          <Heading level="h1">Push Bildirimi Yayınla</Heading>
          <Text className="text-ui-fg-subtle" size="small">
            Bildirime izin veren tüm ziyaretçilere anlık kampanya/duyuru gönderin.
          </Text>
        </div>
      </div>

      <div className="flex flex-col gap-y-4 px-6 py-6 max-w-2xl">
        <div className="flex flex-col gap-y-1.5">
          <Label htmlFor="push-title" size="small" weight="plus">
            Başlık
          </Label>
          <Input
            id="push-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Örn: Deprem haftasına özel %20 indirim!"
            maxLength={80}
          />
        </div>

        <div className="flex flex-col gap-y-1.5">
          <Label htmlFor="push-body" size="small" weight="plus">
            Mesaj
          </Label>
          <Textarea
            id="push-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Bildirimde görünecek açıklama metni…"
            rows={3}
            maxLength={180}
          />
        </div>

        <div className="flex flex-col gap-y-1.5">
          <Label htmlFor="push-url" size="small" weight="plus">
            Tıklama hedefi (yol)
          </Label>
          <Input
            id="push-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/tr/store veya /tr/products/urun-handle"
          />
          <Text className="text-ui-fg-muted" size="xsmall">
            Bildirime tıklayınca açılacak sayfa. Boş bırakılırsa ana sayfa.
          </Text>
        </div>

        <div className="flex flex-col gap-y-1.5">
          <Label htmlFor="push-image" size="small" weight="plus">
            Görsel URL (opsiyonel)
          </Label>
          <Input
            id="push-image"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="https://…/banner.jpg"
          />
        </div>

        {status && (
          <Text
            size="small"
            className={
              status.type === "success" ? "text-ui-fg-interactive" : "text-ui-fg-error"
            }
          >
            {status.text}
          </Text>
        )}

        <div>
          <Button onClick={send} isLoading={sending} disabled={sending}>
            Bildirimi Gönder
          </Button>
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Push Bildirimi",
  icon: BellIcon,
})

export default PushBroadcastPage
