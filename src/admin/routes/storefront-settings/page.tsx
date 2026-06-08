import React, { useState, useEffect } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Input, Button, Switch, Label } from "@medusajs/ui"

// SVG Icons for absolute reliability and style
const SettingsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
)
const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
)
const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
)
const SaveIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
)

interface NavLink {
  label: string
  url: string
}

interface CookieConsent {
  enabled: boolean
  title: string
  message: string
  acceptLabel: string
  declineLabel: string
}

interface Announcement {
  enabled: boolean
  message: string
  backgroundColor: string
  textColor: string
}

const StorefrontSettingsPage = () => {
  const [activeTab, setActiveTab] = useState<"nav" | "cookie" | "announcement">("nav")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // State configurations
  const [navLinks, setNavLinks] = useState<NavLink[]>([
    { label: "Ana Sayfa", url: "/" },
    { label: "Ürünler", url: "/products" },
  ])
  const [cookieConsent, setCookieConsent] = useState<CookieConsent>({
    enabled: true,
    title: "Çerez Politikası",
    message: "Size en iyi deneyimi sunabilmek için sitemizde çerezler kullanmaktayız.",
    acceptLabel: "Kabul Et",
    declineLabel: "Reddet",
  })
  const [announcement, setAnnouncement] = useState<Announcement>({
    enabled: true,
    message: "500 TL ve Üzeri Alışverişlerinizde Kargo Bedava!",
    backgroundColor: "#e11d48",
    textColor: "#ffffff",
  })

  // Fetch settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch("/admin/storefront-settings")
        if (!response.ok) throw new Error("Failed to fetch")
        const data = await response.json()
        
        if (data.settings && Array.isArray(data.settings)) {
          data.settings.forEach((setting: any) => {
            if (setting.key === "nav-links" && Array.isArray(setting.value)) {
              setNavLinks(setting.value)
            } else if (setting.key === "cookie-consent") {
              setCookieConsent(prev => ({ ...prev, ...setting.value }))
            } else if (setting.key === "announcement") {
              setAnnouncement(prev => ({ ...prev, ...setting.value }))
            }
          })
        }
      } catch (err) {
        console.error("Error fetching storefront settings:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchSettings()
  }, [])

  const handleSave = async (key: string, value: any) => {
    setSaving(true)
    setStatusMessage(null)
    try {
      const response = await fetch("/admin/storefront-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      })
      if (!response.ok) throw new Error("Failed to save")
      
      setStatusMessage({ type: "success", text: "Ayarlar başarıyla kaydedildi." })
      setTimeout(() => setStatusMessage(null), 3000)
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Kaydedilirken bir hata oluştu." })
    } finally {
      setSaving(false)
    }
  }

  // Navigation Links Actions
  const addNavLink = () => {
    setNavLinks([...navLinks, { label: "Yeni Menü", url: "/" }])
  }

  const updateNavLink = (index: number, field: keyof NavLink, value: string) => {
    const updated = [...navLinks]
    updated[index][field] = value
    setNavLinks(updated)
  }

  const deleteNavLink = (index: number) => {
    setNavLinks(navLinks.filter((_, i) => i !== index))
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-500 border-t-transparent"></div>
        <span className="ml-3 text-slate-500 text-sm">Yükleniyor...</span>
      </div>
    )
  }

  return (
    <Container className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Heading level="h1" className="text-2xl font-bold flex items-center gap-2">
            <SettingsIcon /> Storefront Panel Ayarları
          </Heading>
          <Text className="text-slate-500 mt-1">
            Next.js vitrin sitesinin menülerini, çerez iznini ve duyuru metinlerini buradan yönetebilirsiniz.
          </Text>
        </div>
      </div>

      {statusMessage && (
        <div className={`mb-6 p-4 rounded-lg border text-sm flex items-center gap-2 ${
          statusMessage.type === "success" 
            ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
            : "bg-rose-50 border-rose-200 text-rose-800"
        }`}>
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Grid containing Settings Form (Left) and Live Preview Mockup (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side: Configuration Panel */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            {/* Tab Headers */}
            <div className="flex border-b border-slate-200 bg-slate-50">
              <button
                onClick={() => setActiveTab("nav")}
                className={`px-5 py-3.5 text-sm font-semibold border-b-2 transition-all ${
                  activeTab === "nav" 
                    ? "border-rose-600 text-rose-600 bg-white" 
                    : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                Menü Bağlantıları
              </button>
              <button
                onClick={() => setActiveTab("cookie")}
                className={`px-5 py-3.5 text-sm font-semibold border-b-2 transition-all ${
                  activeTab === "cookie" 
                    ? "border-rose-600 text-rose-600 bg-white" 
                    : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                Çerez İzni (Cookie)
              </button>
              <button
                onClick={() => setActiveTab("announcement")}
                className={`px-5 py-3.5 text-sm font-semibold border-b-2 transition-all ${
                  activeTab === "announcement" 
                    ? "border-rose-600 text-rose-600 bg-white" 
                    : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                Duyuru Barı
              </button>
            </div>

            {/* Tab Contents */}
            <div className="p-6">
              
              {/* Tab 1: Navigation Links */}
              {activeTab === "nav" && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-2">
                    <div>
                      <Heading level="h2" className="text-base font-bold text-slate-900">Vitrin Navigasyonu</Heading>
                      <Text className="text-xs text-slate-400">Üst menü çubuğunda gösterilecek sayfalar.</Text>
                    </div>
                    <Button 
                      onClick={addNavLink}
                      size="small"
                      className="bg-slate-900 text-white hover:bg-slate-800 flex items-center gap-1.5"
                    >
                      <PlusIcon /> Bağlantı Ekle
                    </Button>
                  </div>

                  <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                    {navLinks.length === 0 ? (
                      <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-lg">
                        Henüz menü bağlantısı eklenmedi.
                      </div>
                    ) : (
                      navLinks.map((link, index) => (
                        <div key={index} className="flex gap-3 items-center bg-slate-50 p-3 rounded-lg border border-slate-100 group">
                          <div className="flex-1">
                            <Input
                              value={link.label}
                              onChange={(e) => updateNavLink(index, "label", e.target.value)}
                              placeholder="Görünen İsim (Örn: Hakkımızda)"
                              className="bg-white border border-slate-200 text-sm"
                            />
                          </div>
                          <div className="flex-[1.5]">
                            <Input
                              value={link.url}
                              onChange={(e) => updateNavLink(index, "url", e.target.value)}
                              placeholder="Yönlendirme Linki (Örn: /about)"
                              className="bg-white border border-slate-200 text-sm"
                            />
                          </div>
                          <button
                            onClick={() => deleteNavLink(index)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex justify-end">
                    <Button 
                      disabled={saving}
                      onClick={() => handleSave("nav-links", navLinks)}
                      className="bg-rose-600 text-white hover:bg-rose-700 flex items-center gap-2"
                    >
                      <SaveIcon /> {saving ? "Kaydediliyor..." : "Menüyü Kaydet"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Tab 2: Cookie Consent */}
              {activeTab === "cookie" && (
                <div className="space-y-5">
                  <div className="flex justify-between items-center mb-2">
                    <div>
                      <Heading level="h2" className="text-base font-bold text-slate-900">Çerez İzni Ayarları</Heading>
                      <Text className="text-xs text-slate-400">Kullanıcılara gösterilecek çerez kullanım uyarısı.</Text>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="cookie-enable" className="text-sm font-semibold text-slate-700">Aktif</Label>
                      <Switch
                        id="cookie-enable"
                        checked={cookieConsent.enabled}
                        onCheckedChange={(checked) => setCookieConsent({ ...cookieConsent, enabled: checked })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-slate-700">Başlık</Label>
                      <Input
                        value={cookieConsent.title}
                        onChange={(e) => setCookieConsent({ ...cookieConsent, title: e.target.value })}
                        placeholder="Başlık"
                        className="bg-white border border-slate-200 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-slate-700">Mesaj Metni</Label>
                      <textarea
                        value={cookieConsent.message}
                        onChange={(e) => setCookieConsent({ ...cookieConsent, message: e.target.value })}
                        placeholder="Çerez bildirim mesajı..."
                        rows={3}
                        className="w-full bg-white border border-slate-200 text-sm rounded-md p-3 focus:outline-none focus:ring-1 focus:ring-rose-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs font-bold text-slate-700">Kabul Et Butonu Metni</Label>
                        <Input
                          value={cookieConsent.acceptLabel}
                          onChange={(e) => setCookieConsent({ ...cookieConsent, acceptLabel: e.target.value })}
                          className="bg-white border border-slate-200 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-bold text-slate-700">Reddet Butonu Metni</Label>
                        <Input
                          value={cookieConsent.declineLabel}
                          onChange={(e) => setCookieConsent({ ...cookieConsent, declineLabel: e.target.value })}
                          className="bg-white border border-slate-200 text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex justify-end">
                    <Button 
                      disabled={saving}
                      onClick={() => handleSave("cookie-consent", cookieConsent)}
                      className="bg-rose-600 text-white hover:bg-rose-700 flex items-center gap-2"
                    >
                      <SaveIcon /> {saving ? "Kaydediliyor..." : "Çerez Ayarlarını Kaydet"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Tab 3: Announcement Bar */}
              {activeTab === "announcement" && (
                <div className="space-y-5">
                  <div className="flex justify-between items-center mb-2">
                    <div>
                      <Heading level="h2" className="text-base font-bold text-slate-900">Duyuru Barı Ayarları</Heading>
                      <Text className="text-xs text-slate-400">Web sitesinin en üstünde yer alacak kampanya / duyuru barı.</Text>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="announce-enable" className="text-sm font-semibold text-slate-700">Aktif</Label>
                      <Switch
                        id="announce-enable"
                        checked={announcement.enabled}
                        onCheckedChange={(checked) => setAnnouncement({ ...announcement, enabled: checked })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-slate-700">Duyuru Mesajı</Label>
                      <Input
                        value={announcement.message}
                        onChange={(e) => setAnnouncement({ ...announcement, message: e.target.value })}
                        placeholder="Duyuru metni yazın..."
                        className="bg-white border border-slate-200 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs font-bold text-slate-700">Arka Plan Rengi</Label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={announcement.backgroundColor}
                            onChange={(e) => setAnnouncement({ ...announcement, backgroundColor: e.target.value })}
                            className="h-9 w-9 rounded-lg border border-slate-200 cursor-pointer"
                          />
                          <Input
                            value={announcement.backgroundColor}
                            onChange={(e) => setAnnouncement({ ...announcement, backgroundColor: e.target.value })}
                            className="bg-white border border-slate-200 text-sm flex-1"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-bold text-slate-700">Yazı Rengi</Label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={announcement.textColor}
                            onChange={(e) => setAnnouncement({ ...announcement, textColor: e.target.value })}
                            className="h-9 w-9 rounded-lg border border-slate-200 cursor-pointer"
                          />
                          <Input
                            value={announcement.textColor}
                            onChange={(e) => setAnnouncement({ ...announcement, textColor: e.target.value })}
                            className="bg-white border border-slate-200 text-sm flex-1"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex justify-end">
                    <Button 
                      disabled={saving}
                      onClick={() => handleSave("announcement", announcement)}
                      className="bg-rose-600 text-white hover:bg-rose-700 flex items-center gap-2"
                    >
                      <SaveIcon /> {saving ? "Kaydediliyor..." : "Duyuru Ayarlarını Kaydet"}
                    </Button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* Right Side: Live Storefront Mockup Preview */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl text-white">
            {/* Mockup Top Header bar */}
            <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold text-slate-300">📱 Vitrin Canlı Önizleme</span>
              <div className="flex gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              </div>
            </div>

            {/* Mockup Body Content */}
            <div className="bg-slate-950 p-4 min-h-[380px] flex flex-col justify-between relative text-slate-800 font-sans">
              
              {/* Top Announcement Bar Preview */}
              <div className="space-y-3">
                {announcement.enabled ? (
                  <div 
                    style={{ backgroundColor: announcement.backgroundColor, color: announcement.textColor }}
                    className="py-1.5 px-3 text-center text-xs font-semibold rounded-md transition-all duration-300 shadow-sm animate-pulse"
                  >
                    {announcement.message || "Duyuru metni bulunmuyor"}
                  </div>
                ) : (
                  <div className="h-6 bg-slate-900 rounded-md border border-dashed border-slate-800 flex items-center justify-center text-[10px] text-slate-600 font-mono">
                    Duyuru Barı Devre Dışı
                  </div>
                )}

                {/* Header Navbar Preview */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 flex justify-between items-center shadow-sm">
                  <span className="font-extrabold text-sm text-slate-900 tracking-tight">DEPREM MARKET</span>
                  <div className="flex gap-3 text-xs font-semibold text-slate-600">
                    {navLinks.map((link, idx) => (
                      <span key={idx} className="hover:text-rose-600 transition-colors cursor-pointer">
                        {link.label}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Simulated Store Hero */}
                <div className="bg-slate-100 border border-slate-200 rounded-lg p-4 text-center mt-3 shadow-sm">
                  <div className="text-xs font-bold text-slate-900">EKYP Afet Hazırlık Seti</div>
                  <div className="text-[10px] text-slate-500 mt-1">Acil durum çantanızı bugünden hazırlayın.</div>
                  <div className="mt-3 inline-block bg-slate-900 text-white text-[10px] px-3 py-1.5 rounded font-bold shadow-sm">
                    Ürünleri İncele
                  </div>
                </div>
              </div>

              {/* Floating Bottom Cookie Consent Banner Preview */}
              <div className="mt-8">
                {cookieConsent.enabled ? (
                  <div className="bg-white border border-slate-200 shadow-xl rounded-xl p-4 space-y-3 border-t-4 border-t-rose-500 transition-all duration-500 transform translate-y-0">
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      🍪 {cookieConsent.title || "Çerezler"}
                    </div>
                    <div className="text-[10px] text-slate-500 leading-normal">
                      {cookieConsent.message || "Mesaj içeriği..."}
                    </div>
                    <div className="flex justify-end gap-2 text-[10px]">
                      <button className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded font-semibold hover:bg-slate-50">
                        {cookieConsent.declineLabel}
                      </button>
                      <button className="px-3 py-1.5 bg-rose-600 text-white rounded font-semibold hover:bg-rose-700 shadow-sm">
                        {cookieConsent.acceptLabel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-4 bg-slate-900 rounded-xl border border-dashed border-slate-800 flex items-center justify-center text-xs text-slate-600 font-mono">
                    Çerez Uyarısı Devre Dışı
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>

      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Vitrin Ayarları",
  icon: SettingsIcon,
})

export default StorefrontSettingsPage
