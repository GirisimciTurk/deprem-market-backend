/**
 * PAZARYERİ SATICI SÖZLEŞME ŞABLONLARI
 * ------------------------------------------------------------------------------------
 * Bu dosya, satıcıların panelde dijital olarak (clickwrap) onaylayacağı yasal metinlerin
 * KAYNAĞIDIR. `runContractSetup` bu şablonları seller_contract tablosuna idempotent
 * şekilde yazar (key ile eşleştirir; metin/sürüm değişince yeni sürümle günceller).
 *
 * ⚠️ HUKUKİ UYARI: Bu metinler ilgili Türk mevzuatına (6563 sayılı Elektronik Ticaretin
 * Düzenlenmesi Hk. Kanun ve ETAHS Yönetmeliği, 6502 Tüketicinin Korunması Hk. Kanun ve
 * Mesafeli Sözleşmeler Yönetmeliği, 6698 KVKK, 6098 Türk Borçlar Kanunu, 213 Vergi Usul
 * Kanunu, 6102 TTK, 6100 HMK) atıflı, kapsamlı PROFESYONEL ŞABLONLARDIR. Yürürlüğe almadan
 * önce mutlaka bir AVUKATA gözden geçirtilmelidir.
 *
 * `[KÖŞELİ PARANTEZ]` içindeki alanlar platformun (aracı hizmet sağlayıcının) kendi yasal
 * bilgileridir; canlıya almadan önce admin "Sözleşmeler" sayfasından doldurulmalıdır.
 * Satıcıya özel bilgiler (ünvan, vergi no, yetkili) sözleşme metnine gömülmez; onay anında
 * "kimlik snapshot'ı" olarak hukuki kayda alınır.
 */

export type ContractTemplate = {
  key: string
  title: string
  version: number
  required: boolean
  body: string
}

const HEAD = (subtitle: string) => `
<p><em>İşbu metin; aşağıda bilgileri yer alan PLATFORM ile elektronik ticaret pazaryerinde
satış yapmak üzere başvuran/onaylanan SATICI arasındaki ilişkide ${subtitle} düzenler.
Metin, satıcı panelinde elektronik ortamda onaylanmakla taraflar arasında yürürlüğe girer;
onay; zaman damgası, IP adresi, cihaz bilgisi, metnin değişmezlik özeti (hash) ve satıcı
kimlik bilgileriyle birlikte hukuki delil olarak saklanır.</em></p>
<h3>PLATFORM (Aracı Hizmet Sağlayıcı) Bilgileri</h3>
<ul>
  <li><strong>Ünvan:</strong> [PLATFORM_UNVAN]</li>
  <li><strong>Adres:</strong> [PLATFORM_ADRES]</li>
  <li><strong>Vergi Dairesi / No:</strong> [PLATFORM_VERGI_DAIRESI] / [PLATFORM_VERGI_NO]</li>
  <li><strong>MERSİS No:</strong> [PLATFORM_MERSIS]</li>
  <li><strong>KEP Adresi:</strong> [PLATFORM_KEP]</li>
  <li><strong>E-posta / Telefon:</strong> [PLATFORM_EPOSTA] / [PLATFORM_TEL]</li>
  <li><strong>İnternet Sitesi:</strong> depremtek.market</li>
</ul>
`

// ─────────────────────────────────────────────────────────────────────────────
// 1) SATICI ÇERÇEVE SÖZLEŞMESİ (Pazaryeri Hizmet Sözleşmesi)
// ─────────────────────────────────────────────────────────────────────────────
const CERCEVE: ContractTemplate = {
  key: "satici-cerceve-sozlesmesi",
  title: "Satıcı Çerçeve Sözleşmesi (Pazaryeri Hizmet Sözleşmesi)",
  version: 1,
  required: true,
  body: `
${HEAD("pazaryeri hizmetlerinin sunulmasına ilişkin tüm hak ve yükümlülükleri")}

<h2>1. Taraflar</h2>
<p>İşbu Satıcı Çerçeve Sözleşmesi ("Sözleşme"), yukarıda bilgileri yer alan <strong>PLATFORM</strong>
(6563 sayılı Kanun anlamında "aracı hizmet sağlayıcı") ile pazaryerinde ürün satışı yapmak üzere
başvuran ve PLATFORM tarafından onaylanan <strong>SATICI</strong> (6563 sayılı Kanun anlamında
"elektronik ticaret hizmet sağlayıcısı") arasında akdedilmiştir. SATICI, yalnızca Türkiye'de
mukim, vergi mükellefi gerçek (şahıs işletmesi) veya tüzel kişi tacir/esnaf olabilir.</p>

<h2>2. Tanımlar</h2>
<ul>
  <li><strong>Pazaryeri:</strong> PLATFORM'a ait depremtek.market alan adı ve uygulamaları üzerinden
  satıcıların ürünlerini son kullanıcılara sunduğu elektronik ticaret ortamı.</li>
  <li><strong>Alıcı/Müşteri:</strong> Pazaryerinden ürün satın alan tüketici veya kişi.</li>
  <li><strong>Ürün:</strong> SATICI'nın pazaryerinde listelediği mal/hizmet.</li>
  <li><strong>Satıcı Paneli:</strong> SATICI'nın ürün, sipariş, kargo, iade, hakediş ve sözleşme
  işlemlerini yürüttüğü yönetim arayüzü.</li>
  <li><strong>Komisyon:</strong> PLATFORM'un aracılık hizmeti karşılığında satış bedeli üzerinden
  aldığı, oranları "Komisyon ve Ücret Eki"nde belirtilen bedel.</li>
  <li><strong>Hakediş:</strong> Komisyon ve diğer kesintiler düşüldükten sonra SATICI'ya ödenecek
  net tutar.</li>
</ul>

<h2>3. Sözleşmenin Konusu ve Kapsamı</h2>
<p>3.1. Sözleşme; SATICI'nın pazaryerinde ürün listeleyip satması, PLATFORM'un bu satışa aracılık
etmesi, satış bedelinin tahsili, komisyon ve hakediş, kargo, iade ve tarafların karşılıklı hak ve
yükümlülüklerinin esaslarını düzenler.</p>
<p>3.2. PLATFORM bir <strong>aracı hizmet sağlayıcıdır</strong>; ürünlerin satıcısı, üreticisi veya
ithalatçısı DEĞİLDİR. Satışa konu ürünün mevzuata, ilanın doğruluğuna ve ayıpsız teslimine ilişkin
tüm hukuki sorumluluk SATICI'ya aittir.</p>

<h2>4. PLATFORM'un Hak ve Yükümlülükleri</h2>
<ul>
  <li>4.1. PLATFORM, pazaryerini teknik olarak işletir, satış bedelini Alıcı'dan tahsil eder ve
  hakedişi işbu Sözleşme ve eklerine göre SATICI'ya öder.</li>
  <li>4.2. PLATFORM, 6563 sayılı Kanun ve ilgili yönetmelik kapsamında üzerine düşen yükümlülükleri
  yerine getirir; hukuka aykırı içerik bildirimlerini değerlendirir.</li>
  <li>4.3. PLATFORM; mevzuata, işbu Sözleşmeye veya eklerine aykırılık halinde ilanı yayından
  kaldırma, SATICI hesabını geçici olarak askıya alma veya Sözleşmeyi feshetme hakkına sahiptir.</li>
  <li>4.4. PLATFORM, komisyon oranlarını, hizmet bedellerini ve kampanya kurallarını "Komisyon ve
  Ücret Eki"nde belirtilen usulle ve makul süre önce bildirimde bulunarak güncelleyebilir.</li>
  <li>4.5. PLATFORM, teknik bakım, güvenlik veya mücbir sebep hallerinde hizmeti geçici olarak
  durdurabilir; sürekliliği taahhüt etmez.</li>
</ul>

<h2>5. SATICI'nın Hak ve Yükümlülükleri</h2>
<ul>
  <li>5.1. SATICI, sattığı ürünlerin yürürlükteki tüm mevzuata (ürün güvenliği, standartlar, etiketleme,
  ithalat/üretim izinleri, garanti, tüketici hakları dahil) uygun, ayıpsız ve satışının serbest
  olduğunu kabul ve taahhüt eder.</li>
  <li>5.2. SATICI, ilan bilgilerinin (başlık, görsel, açıklama, fiyat, stok, kargo süresi) doğru,
  güncel ve yanıltıcı olmamasından sorumludur. "Yasaklı Ürünler ve Satış Kuralları Eki"ne uyar.</li>
  <li>5.3. SATICI, her satış için Alıcı adına <strong>mevzuata uygun fatura/e-arşiv fatura
  düzenlemek</strong> ve ürünle birlikte/elektronik ortamda Alıcı'ya iletmekle yükümlüdür. Faturanın
  düzenlenmesi, vergisel beyan ve ödemeler münhasıran SATICI'nın sorumluluğundadır.</li>
  <li>5.4. SATICI, siparişleri ilan ettiği termin içinde ve sağlam şekilde kargoya verir; takip
  numarasını panele girer. Kargo ve teslimat süreçlerinden SATICI sorumludur.</li>
  <li>5.5. SATICI, 6502 sayılı Kanun ve Mesafeli Sözleşmeler Yönetmeliği uyarınca Alıcı'nın
  <strong>cayma hakkı</strong>, iade, ayıplı mal ve garanti taleplerini karşılamakla yükümlüdür.</li>
  <li>5.6. SATICI, üçüncü kişilerin fikri/sınai mülkiyet haklarını (marka, telif, tasarım, patent)
  ihlal etmeyeceğini; aksi halde doğacak tüm zarardan sorumlu olacağını kabul eder.</li>
  <li>5.7. SATICI, panel erişim bilgilerinin gizliliğinden ve hesabı üzerinden yapılan tüm
  işlemlerden sorumludur.</li>
  <li>5.8. SATICI, başvuru ve panelde beyan ettiği kimlik/iletişim/banka/vergi bilgilerinin doğru ve
  güncel olduğunu; değişiklikleri derhal güncelleyeceğini kabul eder.</li>
</ul>

<h2>6. Bedel, Komisyon ve Hakediş</h2>
<ul>
  <li>6.1. Satış bedeli Alıcı'dan PLATFORM tarafından tahsil edilir. PLATFORM, satış bedelinden
  "Komisyon ve Ücret Eki"nde belirtilen komisyon ve hizmet bedellerini mahsup eder.</li>
  <li>6.2. SATICI hakedişi; ürünün kargoya verilmesi ve ilgili ekte belirtilen hakediş (bekleme)
  süresinin dolmasıyla "ödenebilir" hale gelir ve SATICI'nın beyan ettiği IBAN'a ödenir.</li>
  <li>6.3. İade, iptal, ters ibraz (chargeback), eksik/ayıplı teslim veya uyuşmazlık hallerinde
  ilgili tutar hakedişten mahsup edilir veya bloke edilebilir.</li>
  <li>6.4. Komisyon ve ücretlere ilişkin ayrıntılar, ayrılmaz parça niteliğindeki "Komisyon ve Ücret
  Eki"nde düzenlenmiştir.</li>
</ul>

<h2>7. Fatura ve Vergisel Yükümlülükler</h2>
<p>Satışa ilişkin fatura SATICI tarafından Alıcı'ya düzenlenir. PLATFORM, yalnızca verdiği aracılık/
hizmet karşılığında SATICI'ya komisyon/hizmet faturası düzenler. Satıştan doğan KDV ve diğer vergisel
yükümlülükler SATICI'ya aittir.</p>

<h2>8. Cayma Hakkı, İade ve Değişim</h2>
<p>Alıcı'nın mevzuattan doğan cayma, iade ve değişim talepleri SATICI tarafından karşılanır. Fiziksel
iade teslim alma ve kabul/ret süreci SATICI'da; bedel iadesi ve uyuşmazlık arabuluculuğu PLATFORM
nezdinde yürür. Onaylanan iadelerde ilgili komisyon SATICI'ya iade edilir.</p>

<h2>9. Fikri ve Sınai Haklar</h2>
<p>SATICI, pazaryerine yüklediği içeriklerin (görsel, metin) kendisine ait olduğunu veya kullanım
hakkına sahip olduğunu; PLATFORM'a bu içerikleri pazaryeri ve tanıtım amacıyla kullanma yönünde
münhasır olmayan kullanım hakkı tanıdığını kabul eder. Pazaryerine ait marka ve yazılım hakları
PLATFORM'a aittir.</p>

<h2>10. Kişisel Verilerin Korunması ve Gizlilik</h2>
<p>10.1. Taraflar, 6698 sayılı KVKK ve ilgili mevzuata uygun davranır. Kişisel verilerin işlenmesine
ilişkin esaslar, ayrılmaz parça niteliğindeki "KVKK Aydınlatma Metni ve Açık Rıza" belgesinde
düzenlenmiştir.</p>
<p>10.2. SATICI, sipariş ifası için kendisine aktarılan müşteri verilerini yalnızca bu amaçla işler,
üçüncü kişilerle paylaşmaz, amaç sona erince mevzuata uygun olarak imha eder.</p>
<p>10.3. Taraflar, Sözleşme nedeniyle öğrendikleri ticari sırları gizli tutar.</p>

<h2>11. Sorumluluk ve Tazminat</h2>
<p>11.1. Ürünün ayıbı, mevzuata aykırılığı, fikri mülkiyet ihlali, faturasız satış, geç/eksik teslim
ve benzeri sebeplerden doğan tüm zarar, idari para cezası ve üçüncü kişi/kamu talepleri SATICI'ya
aittir. SATICI bu sebeplerle PLATFORM'a yöneltilen talepleri karşılamayı (rücu) kabul eder.</p>
<p>11.2. PLATFORM'un sorumluluğu, yalnızca aracılık hizmetinin teknik olarak sunulmasıyla sınırlıdır;
dolaylı zararlardan sorumlu tutulamaz.</p>

<h2>12. Askıya Alma ve Fesih</h2>
<ul>
  <li>12.1. Sözleşme süresizdir. Taraflar [FESIH_BILDIRIM_GUN] gün önceden yazılı/elektronik bildirimle
  Sözleşmeyi feshedebilir.</li>
  <li>12.2. SATICI'nın mevzuata, Sözleşmeye veya eklerine aykırı davranması, yanıltıcı bilgi vermesi,
  tekrarlayan müşteri mağduriyeti veya sahte/taklit ürün satışı hallerinde PLATFORM, bildirimsiz olarak
  hesabı askıya alabilir veya Sözleşmeyi haklı nedenle feshedebilir.</li>
  <li>12.3. Fesih halinde tamamlanmış siparişlere ilişkin yükümlülükler (teslim, iade, garanti) devam
  eder; SATICI'nın varsa hakedişi, açık uyuşmazlık/iade riski düşüldükten sonra ödenir.</li>
</ul>

<h2>13. Mücbir Sebep</h2>
<p>Doğal afet, salgın, yangın, savaş, siber saldırı, altyapı/iletişim kesintisi, kamu kararları gibi
tarafların kontrolü dışındaki hallerde, etkilenen taraf bu süre boyunca temerrüde düşmüş sayılmaz.</p>

<h2>14. Tebligat ve Bildirimler</h2>
<p>Tarafların başvuruda/panelde beyan ettiği e-posta ve (varsa) KEP adresleri ile panel içi bildirimler
geçerli tebligat adresi sayılır. Adres değişiklikleri güncellenmezse eski adrese yapılan bildirim
geçerli sayılır.</p>

<h2>15. Devir</h2>
<p>SATICI, Sözleşmeden doğan hak ve yükümlülüklerini PLATFORM'un yazılı onayı olmadan devredemez.
PLATFORM, Sözleşmeyi bir grup şirketine veya halefine devredebilir.</p>

<h2>16. Delil Sözleşmesi</h2>
<p>Taraflar; PLATFORM'un sistem, sunucu ve veri tabanı kayıtlarının, elektronik onay kayıtlarının
(zaman damgası, IP, cihaz bilgisi, içerik hash'i, kimlik snapshot'ı dahil) 6100 sayılı HMK m.193
uyarınca <strong>kesin ve münhasır delil</strong> teşkil edeceğini kabul eder.</p>

<h2>17. Uygulanacak Hukuk ve Yetki</h2>
<p>Sözleşmeye Türk hukuku uygulanır. Uyuşmazlıklarda [YETKILI_MAHKEME] Mahkemeleri ve İcra Daireleri
yetkilidir. Tacirler arası uyuşmazlıklarda 6325 sayılı Kanun kapsamında dava şartı arabuluculuk
hükümleri saklıdır.</p>

<h2>18. Yürürlük ve Elektronik Onay</h2>
<p>18 maddeden ve eklerinden (Komisyon ve Ücret Eki; Yasaklı Ürünler ve Satış Kuralları Eki; KVKK
Aydınlatma Metni ve Açık Rıza) oluşan işbu Sözleşme, SATICI tarafından satıcı panelinde elektronik
olarak onaylandığı anda yürürlüğe girer. Ekler Sözleşmenin ayrılmaz parçasıdır.</p>
`,
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) KVKK AYDINLATMA METNİ VE AÇIK RIZA
// ─────────────────────────────────────────────────────────────────────────────
const KVKK: ContractTemplate = {
  key: "kvkk-aydinlatma-riza",
  title: "KVKK Aydınlatma Metni ve Açık Rıza Beyanı (Satıcı)",
  version: 1,
  required: true,
  body: `
${HEAD("kişisel verilerin işlenmesine ilişkin aydınlatma ve açık rıza esaslarını")}

<h2>1. Veri Sorumlusu</h2>
<p>6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca veri sorumlusu, yukarıda bilgileri
yer alan PLATFORM'dur. İşbu metin, satıcılık başvurusu ve satıcılık ilişkisi kapsamında kişisel
verilerinizin işlenmesine ilişkin sizi aydınlatmak amacıyla hazırlanmıştır.</p>

<h2>2. İşlenen Kişisel Veriler</h2>
<ul>
  <li><strong>Kimlik ve Ünvan:</strong> ad-soyad, yetkili kişi bilgisi, ünvan, T.C. kimlik no/vergi no.</li>
  <li><strong>İletişim:</strong> e-posta, telefon, adres, KEP.</li>
  <li><strong>Finans:</strong> IBAN, banka hesap sahibi, vergi dairesi, hakediş/ödeme kayıtları.</li>
  <li><strong>İşlem Güvenliği:</strong> IP adresi, cihaz/tarayıcı bilgisi, log kayıtları, sözleşme onay
  kayıtları (zaman damgası, içerik hash'i).</li>
  <li><strong>Hukuki İşlem:</strong> sözleşmeler, başvuru ve uyuşmazlık kayıtları.</li>
</ul>

<h2>3. İşleme Amaçları</h2>
<ul>
  <li>Satıcılık başvurusunun değerlendirilmesi ve hesabın oluşturulması,</li>
  <li>Pazaryeri hizmetinin sunulması, sipariş/kargo/iade süreçlerinin yürütülmesi,</li>
  <li>Komisyon, hakediş ve ödeme işlemleri ile muhasebe/faturalama,</li>
  <li>Yasal yükümlülüklerin (vergi, e-ticaret, tüketici mevzuatı) yerine getirilmesi,</li>
  <li>Bilgi güvenliği, dolandırıcılık önleme ve hukuki taleplerin takibi,</li>
  <li>İletişim, bilgilendirme ve uyuşmazlık çözümü.</li>
</ul>

<h2>4. İşlemenin Hukuki Sebepleri</h2>
<p>Verileriniz KVKK m.5/2 kapsamında; <strong>bir sözleşmenin kurulması/ifası için gerekli olması</strong>,
<strong>hukuki yükümlülüğün yerine getirilmesi</strong>, <strong>bir hakkın tesisi/kullanılması/korunması</strong>
ve <strong>meşru menfaat</strong> sebeplerine; bu sebeplerin bulunmadığı hallerde ise <strong>açık
rızanıza</strong> dayanılarak işlenir.</p>

<h2>5. Aktarım</h2>
<p>Verileriniz; yalnızca amaçla sınırlı olmak üzere mevzuatın gerektirdiği kamu kurumlarına, ödeme/banka
kuruluşlarına, kargo firmalarına, e-fatura/e-arşiv entegratörlerine, bilişim/barındırma hizmeti
sağlayıcılarına ve hukuki danışmanlara aktarılabilir. Yurt dışına aktarım, KVKK m.9'daki şartlara uygun
olarak yapılır.</p>

<h2>6. Toplama Yöntemi</h2>
<p>Veriler; başvuru formu, satıcı paneli, e-posta/iletişim kanalları ve sistem logları aracılığıyla
elektronik ortamda toplanır.</p>

<h2>7. Saklama Süresi</h2>
<p>Veriler, ilgili mevzuatta öngörülen zamanaşımı ve saklama süreleri (vergi/ticaret mevzuatı gereği
asgari [SAKLAMA_SURESI] yıl) boyunca saklanır; sürenin sonunda silinir, yok edilir veya anonim hale
getirilir.</p>

<h2>8. İlgili Kişinin Hakları (KVKK m.11)</h2>
<p>Kişisel verilerinize ilişkin; işlenip işlenmediğini öğrenme, bilgi talep etme, amacına uygun
kullanılıp kullanılmadığını öğrenme, düzeltme/silme isteme, aktarıldığı üçüncü kişileri öğrenme,
itiraz ve zararın giderilmesini talep etme haklarına sahipsiniz. Taleplerinizi [PLATFORM_EPOSTA] /
[PLATFORM_KEP] üzerinden iletebilirsiniz.</p>

<h2>9. Açık Rıza Beyanı</h2>
<p>Yukarıdaki aydınlatmayı okudum ve anladım. KVKK m.5/2'deki sebeplere dayanmayan işleme faaliyetleri
ile bu kapsamdaki <strong>yurt içi/yurt dışı aktarımlar</strong> bakımından kişisel verilerimin
işlenmesine <strong>açık rıza</strong> veriyorum.</p>
`,
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) KOMİSYON VE ÜCRET EKİ
// ─────────────────────────────────────────────────────────────────────────────
const KOMISYON: ContractTemplate = {
  key: "komisyon-ucret-eki",
  title: "Komisyon ve Ücret Eki",
  version: 1,
  required: true,
  body: `
${HEAD("komisyon, hizmet bedelleri, kargo ücreti ve hakediş esaslarını")}

<p><em>İşbu Ek, Satıcı Çerçeve Sözleşmesi'nin ayrılmaz parçasıdır. Güncel komisyon oranları ve ücretler
satıcı panelinde her zaman görüntülenebilir.</em></p>

<h2>1. Komisyon</h2>
<ul>
  <li>1.1. PLATFORM, aracılık hizmeti karşılığında her satıştan komisyon alır. Komisyon, ürünün ait
  olduğu <strong>kategoriye göre</strong> belirlenir; kategori bazlı oran tanımlı değilse satıcıya özel
  oran, o da yoksa varsayılan oran uygulanır.</li>
  <li>1.2. Komisyon matrahı, <strong>KDV dahil satış bedelidir</strong> (kargo bedeli hariç). Komisyon,
  satış anındaki geçerli orana göre hesaplanır.</li>
  <li>1.3. Güncel kategori komisyon oranları satıcı panelinde "Komisyon Oranları"/ürün detayında
  gösterilir ve işbu Ekin parçası sayılır.</li>
</ul>

<h2>2. Kargo ve Desi Ücreti (Hibrit Model)</h2>
<ul>
  <li>2.1. SATICI, gönderiyi PLATFORM'un anlaşmalı kargo firması ile veya kendi anlaşmalı kargosuyla
  gönderebilir.</li>
  <li>2.2. <strong>Anlaşmalı kargo</strong> ile gönderimde, gönderinin desi/ağırlığına göre hesaplanan
  kargo bedeli SATICI hakedişinden mahsup edilir (desi tarifesi panelde yayımlanır).</li>
  <li>2.3. SATICI <strong>kendi kargosuyla</strong> gönderirse kargo bedeli hakedişten düşülmez; kargo
  maliyeti ve sorumluluğu SATICI'ya aittir.</li>
</ul>

<h2>3. Hakediş ve Ödeme</h2>
<ul>
  <li>3.1. Satış bedeli Alıcı'dan PLATFORM tarafından tahsil edilir.</li>
  <li>3.2. SATICI hakedişi (satış bedeli − komisyon − varsa kargo/diğer kesintiler), ürünün kargoya
  verilmesinden itibaren <strong>[HAKEDIS_GUN] gün</strong> hakediş (bekleme) süresinin dolmasıyla
  "ödenebilir" hale gelir.</li>
  <li>3.3. Ödenebilir hakedişler, SATICI'nın beyan ettiği IBAN'a [ODEME_PERIYODU] periyodunda ödenir.</li>
  <li>3.4. İade/iptal/ayıplı teslim/ters ibraz hallerinde ilgili tutar ve komisyon düzeltmesi
  hakedişten mahsup edilir; gerekirse bloke uygulanır.</li>
</ul>

<h2>4. Diğer Hizmet Bedelleri</h2>
<p>Varsa kampanya katılım, reklam/öne çıkarma, ek hizmet bedelleri panelde ilan edilir ve yalnızca
SATICI'nın onayıyla uygulanır.</p>

<h2>5. Ücret Değişikliği</h2>
<p>PLATFORM, komisyon ve ücretleri makul gerekçeyle değiştirebilir. Değişiklikler en az
<strong>[UCRET_DEGISIM_BILDIRIM_GUN] gün</strong> önce panel ve/veya e-posta ile bildirilir;
yürürlük tarihinden önceki siparişlere eski oranlar uygulanır. SATICI değişikliği kabul etmezse
Sözleşmeyi feshedebilir.</p>

<h2>6. Vergiler</h2>
<p>Komisyon ve hizmet bedellerine ilişkin KDV ayrıca uygulanır. PLATFORM, komisyon/hizmet bedeli için
SATICI'ya fatura düzenler.</p>
`,
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) YASAKLI / KISITLI ÜRÜNLER VE SATIŞ KURALLARI EKİ
// ─────────────────────────────────────────────────────────────────────────────
const YASAKLI: ContractTemplate = {
  key: "yasakli-urunler-satis-kurallari",
  title: "Yasaklı/Kısıtlı Ürünler ve Satış Kuralları Eki",
  version: 1,
  required: true,
  body: `
${HEAD("pazaryerinde satışı yasak/kısıtlı ürünleri ve satış kurallarını")}

<p><em>İşbu Ek, Satıcı Çerçeve Sözleşmesi'nin ayrılmaz parçasıdır. Liste örnekleyicidir; mevzuat
gereği satışı yasak/izne tabi tüm ürünler kapsamdadır.</em></p>

<h2>1. Satışı Kesinlikle Yasak Ürünler</h2>
<ul>
  <li>Ateşli silahlar, mühimmat, patlayıcılar ve bunların aksamı; bıçak/kesici aletlerde mevzuata aykırı olanlar.</li>
  <li>Uyuşturucu/uyarıcı maddeler, bunların öncülleri ve ilgili ekipman.</li>
  <li>Reçeteye tabi ilaçlar, beşeri tıbbi ürünler ve ruhsatsız/izinsiz sağlık ürünleri.</li>
  <li>Sahte, taklit, kaçak veya fikri/sınai hak ihlali içeren ürünler.</li>
  <li>İnsan/organ, canlı hayvan (mevzuata aykırı), nesli tehlikedeki türler ve bunlardan elde edilen ürünler.</li>
  <li>Müstehcen/yasa dışı içerik, kumar ve şans oyunu araçları.</li>
  <li>Çalıntı mallar, sahte resmi belge, tehlikeli kimyasallar ve mevzuatça satışı yasak diğer ürünler.</li>
</ul>

<h2>2. Kısıtlı / İzne Tabi Ürünler</h2>
<ul>
  <li>Yangın söndürücü, ilk yardım/medikal malzeme, kişisel koruyucu donanım (KKD), tüpgaz/ısıtıcı gibi
  ürünler ancak ilgili <strong>standart, belge ve izinlere (CE, TSE, ÜTS, ithalat izni vb.)</strong>
  sahip olmak ve bunları talep halinde ibraz etmek kaydıyla satılabilir.</li>
  <li>Gıda ve gıda takviyeleri; ilgili mevzuata, etiketleme ve son kullanma tarihi kurallarına uygun olmalıdır.</li>
  <li>Elektronik/elektrikli cihazlar; güvenlik ve uygunluk belgelerine sahip olmalıdır.</li>
</ul>

<h2>3. Ürün ve İlan Kuralları</h2>
<ul>
  <li>İlanlar gerçek, doğru ve güncel olmalı; başlık/görsel/açıklama yanıltıcı olmamalıdır.</li>
  <li>Görseller ürünü doğru temsil etmeli; başka satıcıya/markaya ait görsel hak ihlali yapılmamalıdır.</li>
  <li>Stok bilgisi güncel tutulmalı; stokta olmayan ürün satışa açık bırakılmamalıdır (aşırı satış yasağı).</li>
  <li><strong>Yanıltıcı fiyatlandırma</strong> (sahte indirim, suni fiyat şişirme), fahiş fiyat ve fiyat
  manipülasyonu yasaktır (6585 sayılı Kanun ve haksız ticari uygulama hükümleri saklıdır).</li>
  <li>Afet/acil durum ürünlerinde fırsatçı fiyat artışı ve stokçuluk kesinlikle yasaktır.</li>
</ul>

<h2>4. Satış ve Operasyon Kuralları</h2>
<ul>
  <li>SATICI, siparişi ilan ettiği termin içinde hazırlayıp kargoya verir ve takip no'sunu panele girer.</li>
  <li>Müşteri soru/şikayetleri makul sürede yanıtlanır; iade/değişim talepleri mevzuata uygun karşılanır.</li>
  <li>Pazaryeri dışına yönlendirme, müşteri verisini amaç dışı kullanma ve haksız rekabet yasaktır.</li>
</ul>

<h2>5. İhlal ve Yaptırımlar</h2>
<p>Bu Eke aykırılık halinde PLATFORM, ihlalin niteliğine göre kademeli olarak; <strong>uyarı, ilanın
yayından kaldırılması, hesabın geçici askıya alınması veya Sözleşmenin haklı nedenle feshi</strong>
yaptırımlarını uygulayabilir. Yasaklı ürün satışı, sahte/taklit ürün ve tekrarlayan ağır ihlaller
bildirimsiz fesih sebebidir. SATICI, ihlalden doğan idari/cezai sorumluluk ve üçüncü kişi taleplerinden
münhasıran sorumludur.</p>
`,
}

export const CONTRACT_TEMPLATES: ContractTemplate[] = [CERCEVE, KVKK, KOMISYON, YASAKLI]
