# GitReverse Turkish (Translated by mehmetdemir-tr)

https://github.com/user-attachments/assets/f0cdb7b2-c6f0-4483-8a01-153170479f2e

Bir **Geliştirilmeye açık GitHub deposunu** birisinin Cursor, Claude Code, Codex vb. uygulamalara yapıştırarak projeyi sıfırdan kodlayabileceği **tek sentetik yapay zeka istem satırına** dönüştürün.

Bu uygulama, **repo meta verilerini**, bir **kök dosya ağacını** (derinlik yani depth 1) ve **README** dosyasını alır; ardından [OpenRouter](https://openrouter.ai/) aracılığıyla bir LLM kullanarak bu bağlamda temellendirilmiş kısa ve sohbet tarzında bir istem satırı oluşturur.

Ana sayfaya bir Github URL'si veya 'owner/repo' (sahip/depo) yazın. Aynı iş akışını çalıştıran paylaşılabilir bir bağlantı için **'/sahip/depo'** (ör. '/vercel/next.js) adresinide açabilirsiniz.

Bu sitedeki GitHub tarzı **'/owner/repo/tree/...'** URL'leri, 404 hatası vermemeleri için **`/owner/repo`** adresine yönlendirilir. Ters akış şimdilik hala tüm depoyu kullanmaktadır; **alt klasörleri algılayan** bağlam (o yolun kapsamına dahil) daha sonraki bir güncellemede eklenecektir.

## Yığın (Stack)
Next.js (Uygulama Yönlendiricisi), React, TypeScript, Tailwind CSS, Github API Ve OpenRouter.

## Yapılandırma
`.env.example` dosyasını `.env.local` dosyasına kopyalayın. **`OPENROUTER_API_KEY`**'e ihtiyacınız var. İsteğe bağlı: `OPENROUTER_MODEL` (varsayılan olarak `google/gemini-2.5-pro`), daha iyi GitHub hız sınırları için `GITHUB_TOKEN` ve sunucu tarafında önbellekleme istiyorsanız örnek dosyadaki Supabase ortam değişkenleri.

### Özel ters yönlendirme (isteğe bağlı)



**deep / focus** istemleri için, **custom_reverse** hizmetini (ayrı bir TypeScript projesi; `README` dosyasına bakın; `pnpm dev`, varsayılan bağlantı noktası **3001**) yerel olarak çalıştırın veya kendi arka ucunuza dağıtın. `.env.local` dosyasında şunu ayarlayın:



`CUSTOM_REVERSE_SERVICE_URL=http://localhost:3001`



`SUPABASE_URL` ve `SUPABASE_PUBLISHABLE_KEY` ayarlandığında başarılı çalıştırmalar Supabase'de (`custom_prompt_cache`) saklanır; bunlar genel kütüphanede **görünmez**.



Ardından ana sayfada **Özel tersine çevirme** seçeneğini etkinleştirin ve neyin tersine mühendislik yapılacağını açıklayın.



## Geliştirme


```bash

pnpm install

pnpm dev

```



[http://localhost:3000](http://localhost:3000) adresini açın.


[GitIngest](http://github.com/coderamp-labs/gitingest)'e fikir ve ilham için teşekkürler! :)

***Çeviri: mehmetdemir-tr (Mehmet Demir)***

