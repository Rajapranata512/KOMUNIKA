import { randomUUID } from 'node:crypto';

import { hash } from 'argon2';

import { database } from './client.js';

const demoYear = 2025;
const journalSlug = 'jurnal-cakrawala-data-teknologi-demo';
const topics = [
  [
    'Pemetaan Literasi Data pada Sekolah Menengah di Wilayah Pesisir',
    'Model Klasifikasi Sampah Berbasis Citra untuk Edukasi Lingkungan',
    'Evaluasi Aksesibilitas Portal Layanan Publik pada Perangkat Bergerak',
    'Analisis Pola Mobilitas Perkotaan Menggunakan Data Terbuka',
    'Perancangan Dashboard Ketahanan Pangan untuk Pemerintah Daerah',
    'Deteksi Anomali Konsumsi Energi pada Bangunan Pendidikan',
    'Tata Kelola Dataset Penelitian untuk Kolaborasi Lintas Institusi',
    'Pengukuran Kesiapan Transformasi Digital pada Usaha Mikro',
    'Pendekatan Partisipatif untuk Visualisasi Risiko Banjir',
    'Audit Kualitas Metadata pada Repositori Institusi',
  ],
  [
    'Prediksi Kebutuhan Air Bersih Menggunakan Deret Waktu',
    'Kerangka Etika Pemanfaatan Kecerdasan Artifisial di Perguruan Tinggi',
    'Optimasi Rute Distribusi Produk Pertanian bagi Koperasi Lokal',
    'Analisis Sentimen Layanan Transportasi Publik Berbahasa Indonesia',
    'Desain Sistem Peringatan Dini untuk Kualitas Udara Perkotaan',
    'Penerapan Data Terbuka untuk Transparansi Anggaran Desa',
    'Studi Usabilitas Aplikasi Telemedisin bagi Pengguna Lanjut Usia',
    'Pemodelan Risiko Putus Sekolah dengan Pendekatan Interpretable Machine Learning',
    'Integrasi Informasi Geospasial untuk Pengelolaan Ruang Terbuka Hijau',
    'Katalog Data Terstandar untuk Mendukung Riset Multidisiplin',
  ],
  [
    'Analisis Ketahanan Rantai Pasok Pangan Menggunakan Simulasi Diskrit',
    'Pengembangan Indeks Kematangan Keamanan Informasi untuk Organisasi Nirlaba',
    'Visualisasi Jejak Karbon Rumah Tangga sebagai Media Literasi Lingkungan',
    'Evaluasi Bias pada Model Seleksi Penerima Bantuan Sosial',
    'Arsitektur Interoperabilitas Data Kesehatan pada Layanan Primer',
    'Pemanfaatan Sensor Berbiaya Rendah untuk Pemantauan Kualitas Sungai',
    'Metode Anonimisasi Data untuk Riset Mobilitas Penduduk',
    'Analisis Jaringan Kolaborasi pada Publikasi Ilmiah Indonesia',
    'Sistem Rekomendasi Bahan Bacaan untuk Perpustakaan Komunitas',
    'Kerangka Pengukuran Dampak Program Inklusi Digital',
  ],
] as const;

const authorNames = [
  ['Nadia Prameswari', 'Rizky Adinata'],
  ['Sinta Mahardika', 'Fajar Nugraha'],
  ['Dimas Wicaksana', 'Larasati Putri'],
  ['Maya Kartikasari', 'Bagas Kurniawan'],
  ['Arif Rahmanto', 'Niken Wulandari'],
] as const;

function splitName(name: string) {
  const parts = name.split(' ');
  return { givenName: parts[0] ?? name, familyName: parts.slice(1).join(' ') };
}

async function main() {
  const creator = await database.user.upsert({
    where: { email: 'demo-publisher@example.invalid' },
    update: { fullName: 'Pengelola Data Demo' },
    create: {
      email: 'demo-publisher@example.invalid',
      passwordHash: await hash(randomUUID()),
      fullName: 'Pengelola Data Demo',
      affiliation: 'Aksara Nusa Global Publishing — Data Fiktif',
      emailVerifiedAt: new Date('2025-01-01T00:00:00.000Z'),
    },
  });

  const journal = await database.journal.upsert({
    where: { slug: journalSlug },
    update: { status: 'PUBLISHED', submissionsOpen: true },
    create: {
      slug: journalSlug,
      title: 'Jurnal Cakrawala Data dan Teknologi (Demo)',
      abbreviation: 'JCDT',
      description:
        'Jurnal demonstrasi fiktif untuk memperlihatkan arsip terbitan dan alur publikasi ilmiah pada platform ANG Publishing.',
      scope:
        'Sains data, teknologi informasi, tata kelola data, dan penerapan komputasi untuk kepentingan masyarakat.',
      contactEmail: 'editor-demo@example.invalid',
      primaryLanguage: 'id',
      reviewModel: 'DOUBLE_ANONYMOUS',
      status: 'PUBLISHED',
      submissionsOpen: true,
      createdById: creator.id,
    },
  });

  const section = await database.journalSection.upsert({
    where: { journalId_slug: { journalId: journal.id, slug: 'artikel-riset' } },
    update: { isActive: true },
    create: {
      journalId: journal.id,
      slug: 'artikel-riset',
      title: 'Artikel Riset',
      description: 'Artikel hasil penelitian orisinal.',
      isActive: true,
    },
  });
  const articleType = await database.articleType.upsert({
    where: { journalId_slug: { journalId: journal.id, slug: 'artikel-penelitian' } },
    update: { isActive: true, sectionId: section.id },
    create: {
      journalId: journal.id,
      sectionId: section.id,
      slug: 'artikel-penelitian',
      title: 'Artikel Penelitian',
      description: 'Naskah penelitian orisinal yang melalui penelaahan sejawat.',
      peerReviewRequired: true,
    },
  });

  for (let issueIndex = 0; issueIndex < topics.length; issueIndex += 1) {
    const number = String(issueIndex + 1);
    const publishedAt = new Date(Date.UTC(demoYear, [1, 5, 9][issueIndex] ?? 1, 28, 3));
    const issue = await database.issue.upsert({
      where: {
        journalId_slug: { journalId: journal.id, slug: `volume-1-nomor-${number}-${demoYear}` },
      },
      update: { status: 'PUBLISHED', publishedAt },
      create: {
        journalId: journal.id,
        slug: `volume-1-nomor-${number}-${demoYear}`,
        volume: '1',
        number,
        year: demoYear,
        title: `Volume 1 Nomor ${number} (${demoYear})`,
        description: `Terbitan demo fiktif periode ${['Februari', 'Juni', 'Oktober'][issueIndex]} ${demoYear}.`,
        status: 'PUBLISHED',
        publishedAt,
      },
    });

    for (let articleIndex = 0; articleIndex < topics[issueIndex]!.length; articleIndex += 1) {
      const title = topics[issueIndex]![articleIndex]!;
      const slug = `demo-${demoYear}-${number}-${String(articleIndex + 1).padStart(2, '0')}`;
      const existing = await database.publication.findUnique({
        where: { journalId_slug: { journalId: journal.id, slug } },
        select: { id: true },
      });
      if (existing) continue;

      const names = authorNames[(issueIndex * 10 + articleIndex) % authorNames.length]!;
      const authors = names.map((name) => ({
        name,
        affiliation: 'Institusi Riset Fiktif Nusantara',
      }));
      const abstract = `Artikel demonstrasi ini membahas ${title.toLowerCase()} melalui rancangan penelitian terstruktur, data fiktif, dan analisis yang dapat ditelusuri. Rekam ini hanya digunakan untuk simulasi antarmuka platform dan tidak merepresentasikan penelitian, penulis, institusi, hasil, atau klaim ilmiah yang nyata.`;
      const submission = await database.submission.create({
        data: {
          journalId: journal.id,
          submitterId: creator.id,
          articleTypeId: articleType.id,
          state: 'PUBLISHED',
          title,
          abstract,
          coverLetter: 'Data demonstrasi fiktif untuk pratinjau workflow.',
          language: 'id',
          submittedAt: publishedAt,
          authors: {
            create: names.map((name, order) => ({
              ...splitName(name),
              email: `penulis-${issueIndex + 1}-${articleIndex + 1}-${order + 1}@example.invalid`,
              affiliation: 'Institusi Riset Fiktif Nusantara',
              countryCode: 'ID',
              sortOrder: order,
              isCorresponding: order === 0,
            })),
          },
          keywords: {
            create: [
              { value: 'data', sortOrder: 0 },
              { value: 'teknologi', sortOrder: 1 },
              { value: 'demonstrasi', sortOrder: 2 },
            ],
          },
          timeline: {
            create: {
              actorId: creator.id,
              state: 'PUBLISHED',
              action: 'demo.publication_seeded',
              description: 'Rekam publikasi fiktif dibuat untuk demonstrasi.',
              visibleToAuthor: true,
              createdAt: publishedAt,
            },
          },
        },
      });
      const sourceVersion = await database.submissionVersion.create({
        data: {
          submissionId: submission.id,
          version: 1,
          snapshot: {
            title,
            abstract,
            authors,
            keywords: ['data', 'teknologi', 'demonstrasi'],
            demo: true,
          },
          createdAt: publishedAt,
        },
      });
      await database.submission.update({
        where: { id: submission.id },
        data: { acceptedVersionId: sourceVersion.id },
      });
      await database.publication.create({
        data: {
          journalId: journal.id,
          submissionId: submission.id,
          issueId: issue.id,
          slug,
          status: 'PUBLISHED',
          articleOrder: articleIndex + 1,
          publishedAt,
          versions: {
            create: {
              journalId: journal.id,
              sourceVersionId: sourceVersion.id,
              createdById: creator.id,
              version: 1,
              title,
              abstract,
              authors,
              keywords: ['data', 'teknologi', 'demonstrasi'],
              language: 'id',
              licenseName: 'Lisensi demonstrasi — bukan publikasi nyata',
              licenseUrl: 'https://example.invalid/demo-license',
              copyrightHolder: 'Data Fiktif ANG Publishing',
              pages: `${articleIndex * 10 + 1}-${articleIndex * 10 + 10}`,
            },
          },
        },
      });
    }
  }

  console.log(`Demo seed ready: ${journal.title}, 3 issues, 30 fictional articles.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Demo seed failed.');
    process.exitCode = 1;
  })
  .finally(async () => database.$disconnect());
