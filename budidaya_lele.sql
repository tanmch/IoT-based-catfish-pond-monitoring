-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Jan 31, 2026 at 11:36 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.0.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `budidaya_lele`
--

-- --------------------------------------------------------

--
-- Table structure for table `aktivitas`
--

CREATE TABLE `aktivitas` (
  `id` int(11) NOT NULL,
  `waktu` datetime NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `username_snap` varchar(100) DEFAULT NULL,
  `role_snap` varchar(20) DEFAULT NULL,
  `kolam_id` int(11) DEFAULT NULL,
  `isi_kolam_id` int(11) DEFAULT NULL,
  `ikan_id` int(11) DEFAULT NULL,
  `feed_id` int(11) DEFAULT NULL,
  `panen_id` int(11) DEFAULT NULL,
  `transaksi_id` int(11) DEFAULT NULL,
  `vendor_id` int(11) DEFAULT NULL,
  `ref_ukuran_id` int(11) DEFAULT NULL,
  `from_kolam_id` int(11) DEFAULT NULL,
  `to_kolam_id` int(11) DEFAULT NULL,
  `jenis` varchar(30) NOT NULL,
  `aksi` varchar(40) NOT NULL,
  `deskripsi` text DEFAULT NULL,
  `qty_ekor` int(11) DEFAULT NULL,
  `berat_kg` decimal(12,3) DEFAULT NULL,
  `amount_kg` decimal(12,3) DEFAULT NULL,
  `harga_per_kg` decimal(12,2) DEFAULT NULL,
  `biaya` decimal(14,2) DEFAULT NULL,
  `pendapatan` decimal(14,2) DEFAULT NULL,
  `saldo_delta` decimal(14,2) DEFAULT NULL,
  `meta` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`meta`)),
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `aktivitas`
--

INSERT INTO `aktivitas` (`id`, `waktu`, `user_id`, `username_snap`, `role_snap`, `kolam_id`, `isi_kolam_id`, `ikan_id`, `feed_id`, `panen_id`, `transaksi_id`, `vendor_id`, `ref_ukuran_id`, `from_kolam_id`, `to_kolam_id`, `jenis`, `aksi`, `deskripsi`, `qty_ekor`, `berat_kg`, `amount_kg`, `harga_per_kg`, `biaya`, `pendapatan`, `saldo_delta`, `meta`, `created_at`) VALUES
(1, '2025-11-23 21:40:00', 1, 'bagas31@gmail.com', 'pemilik', NULL, NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, 'pakan', 'FEED_STOCK_DELETE', 'Hapus stok X (batal beli)', NULL, NULL, NULL, NULL, -10000.00, NULL, 10000.00, 'null', '2025-11-23 21:43:11'),
(2, '2025-11-23 21:43:58', 1, 'bagas31@gmail.com', 'pemilik', 1, 1, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'ikan', 'ADD_FISH', 'Lele - ABC masuk ke ABC', 2, 0.100, NULL, NULL, NULL, NULL, NULL, '{\"vendor\": \"Rudi\", \"harga_per_kg_snapshot\": 50000.0, \"harga_per_unit_snapshot\": 0.0}', '2025-11-23 21:43:58'),
(3, '2025-11-23 21:53:52', 1, 'bagas31@gmail.com', 'pemilik', 1, NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, 'pakan', 'FEEDING', 'Pemberian SPLA 2 ke ABC', NULL, NULL, 0.004, 20000.00, 80.00, NULL, NULL, '{\"type\": \"Pakan\"}', '2025-11-23 21:53:52'),
(4, '2025-11-23 21:54:02', 1, 'bagas31@gmail.com', 'pemilik', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'mortalitas', 'MORTALITY', 'Kematian ikan di ABC', 1, NULL, NULL, NULL, NULL, NULL, NULL, '{\"keterangan\": \"\"}', '2025-11-23 21:54:02'),
(5, '2025-11-23 21:54:31', 1, 'bagas31@gmail.com', 'pemilik', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'mortalitas', 'MORTALITY', 'Kematian ikan di ABC', 1, NULL, NULL, NULL, NULL, NULL, NULL, '{\"keterangan\": \"\"}', '2025-11-23 21:54:31'),
(6, '2025-11-23 21:54:38', 1, 'bagas31@gmail.com', 'pemilik', 1, 2, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'ikan', 'ADD_FISH', 'Lele - ABC masuk ke ABC', 50, 2.500, NULL, NULL, NULL, NULL, NULL, '{\"vendor\": \"Rudi\", \"harga_per_kg_snapshot\": 50000.0, \"harga_per_unit_snapshot\": 0.0}', '2025-11-23 21:54:38'),
(7, '2025-11-23 21:54:51', 1, 'bagas31@gmail.com', 'pemilik', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'sortir', 'SORTIR_SUMMARY', 'Sortir ABC: 2 ekor, expected 0.100 kg, actual 5.000 kg; susut -4.900 kg (-4900.00%)', 2, 5.000, NULL, NULL, NULL, NULL, NULL, '{\"total_ekor_asal\": 50, \"total_kg_asal\": 2.5, \"total_ekor_dipindah\": 2, \"expected_kg_dipindah\": 0.1, \"actual_kg_input\": 5.0, \"susut_kg\": -4.9, \"susut_percent\": -4900.0, \"sisa_ekor_asal\": 48, \"sisa_kg_asal\": 2.4}', '2025-11-23 21:54:51'),
(8, '2025-11-23 22:26:26', 1, 'bagas31@gmail.com', 'pemilik', 1, NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, 'pakan', 'FEEDING_EDIT', 'Ubah pemberian: SPLA 2 → SPLA 2', NULL, NULL, 2.000, 20000.00, 40000.00, NULL, NULL, '{\"old_type\": \"pakan\", \"new_type\": \"pakan\"}', '2025-11-23 22:26:26'),
(9, '2025-11-23 22:33:08', 1, 'bagas31@gmail.com', 'pemilik', 1, NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, 'pakan', 'FEEDING', 'Pemberian SPLA 2 ke ABC', NULL, NULL, 0.220, 20000.00, 4400.00, NULL, NULL, '{\"type\": \"Pakan\"}', '2025-11-23 22:33:08'),
(10, '2025-11-23 22:33:38', 1, 'bagas31@gmail.com', 'pemilik', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'sortir', 'SORTIR_SUMMARY', 'Sortir ABC: 2 ekor, expected 0.193 kg, actual 2.000 kg; susut -1.808 kg (-938.96%)', 2, 2.000, NULL, NULL, NULL, NULL, NULL, '{\"total_ekor_asal\": 48, \"total_kg_asal\": 4.62, \"total_ekor_dipindah\": 2, \"expected_kg_dipindah\": 0.1925, \"actual_kg_input\": 2.0, \"susut_kg\": -1.8075, \"susut_percent\": -938.961038961039, \"sisa_ekor_asal\": 46, \"sisa_kg_asal\": 4.428}', '2025-11-23 22:33:38'),
(11, '2025-11-23 22:34:44', 1, 'bagas31@gmail.com', 'pemilik', 2, NULL, NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, 'panen', 'PANEN_PENUH', 'Panen A (penuh)', 4, 223.000, NULL, NULL, 16500.00, 11150000.00, 11150000.00, '{\"fcr\": 0.0, \"hpp_total\": 16500.0}', '2025-11-23 22:34:44'),
(12, '2025-11-23 22:35:01', 1, 'bagas31@gmail.com', 'pemilik', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'sortir', 'SORTIR_SUMMARY', 'Sortir ABC: 20 ekor, expected 1.925 kg, actual 50.000 kg; susut -48.075 kg (-2497.11%)', 20, 50.000, NULL, NULL, NULL, NULL, NULL, '{\"total_ekor_asal\": 46, \"total_kg_asal\": 4.428, \"total_ekor_dipindah\": 20, \"expected_kg_dipindah\": 1.9252173913043478, \"actual_kg_input\": 50.0, \"susut_kg\": -48.07478260869565, \"susut_percent\": -2497.1093044263775, \"sisa_ekor_asal\": 26, \"sisa_kg_asal\": 2.503}', '2025-11-23 22:35:01'),
(13, '2025-11-23 22:35:23', 1, 'bagas31@gmail.com', 'pemilik', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'mortalitas', 'MORTALITY', 'Kematian ikan di ABC', 26, NULL, NULL, NULL, NULL, NULL, NULL, '{\"keterangan\": \"\"}', '2025-11-23 22:35:23'),
(14, '2025-11-23 22:35:51', 1, 'bagas31@gmail.com', 'pemilik', 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'sortir', 'SORTIR_SUMMARY', 'Sortir A: 10 ekor, expected 0.963 kg, actual 1.000 kg; susut -0.037 kg (-3.90%)', 10, 1.000, NULL, NULL, NULL, NULL, NULL, '{\"total_ekor_asal\": 20, \"total_kg_asal\": 1.925, \"total_ekor_dipindah\": 10, \"expected_kg_dipindah\": 0.9625, \"actual_kg_input\": 1.0, \"susut_kg\": -0.03749999999999998, \"susut_percent\": -3.896103896103894, \"sisa_ekor_asal\": 10, \"sisa_kg_asal\": 0.963}', '2025-11-23 22:35:51'),
(15, '2025-11-23 22:42:52', 1, 'bagas31@gmail.com', 'pemilik', 1, NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, 'pakan', 'FEEDING', 'Pemberian SPLA 2 ke ABC', NULL, NULL, 5.000, 20000.00, 100000.00, NULL, NULL, '{\"type\": \"Pakan\"}', '2025-11-23 22:42:52'),
(16, '2025-11-23 22:45:21', 1, 'bagas31@gmail.com', 'pemilik', 1, NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, 'pakan', 'FEEDING', 'Pemberian SPLA 2 ke ABC', NULL, NULL, 0.298, 20000.00, 5960.00, NULL, NULL, '{\"type\": \"Pakan\"}', '2025-11-23 22:45:21'),
(17, '2025-11-24 19:30:45', 1, 'bagas31@gmail.com', 'pemilik', 2, NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, 'pakan', 'FEEDING', 'Pemberian SPLA 2 ke A', NULL, NULL, 0.048, 20000.00, 960.00, NULL, NULL, '{\"type\": \"Pakan\"}', '2025-11-24 19:30:45'),
(18, '2025-11-24 19:31:03', 1, 'bagas31@gmail.com', 'pemilik', 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'sortir', 'SORTIR_SUMMARY', 'Sortir A: 1 ekor, expected 0.101 kg, actual 1.000 kg; susut -0.899 kg (-889.12%)', 1, 1.000, NULL, NULL, NULL, NULL, NULL, '{\"total_ekor_asal\": 10, \"total_kg_asal\": 1.011, \"total_ekor_dipindah\": 1, \"expected_kg_dipindah\": 0.1011, \"actual_kg_input\": 1.0, \"susut_kg\": -0.8989, \"susut_percent\": -889.1196834817013, \"sisa_ekor_asal\": 9, \"sisa_kg_asal\": 0.91}', '2025-11-24 19:31:03'),
(19, '2025-11-24 19:31:13', 1, 'bagas31@gmail.com', 'pemilik', 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'mortalitas', 'MORTALITY', 'Kematian ikan di C', 1, NULL, NULL, NULL, NULL, NULL, NULL, '{\"keterangan\": \"\"}', '2025-11-24 19:31:13');

-- --------------------------------------------------------

--
-- Table structure for table `feed_logs`
--

CREATE TABLE `feed_logs` (
  `id` int(11) NOT NULL,
  `kolam_id` int(11) DEFAULT NULL,
  `feed_id` int(11) DEFAULT NULL,
  `amount_kg` float NOT NULL,
  `tanggal` date DEFAULT NULL,
  `waktu` time DEFAULT NULL,
  `feeding_mode` enum('manual','auto_3','auto_4') NOT NULL DEFAULT 'manual',
  `created_at` datetime DEFAULT NULL,
  `isi_kolam_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `feed_stock`
--

CREATE TABLE `feed_stock` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `type` varchar(50) DEFAULT NULL,
  `quantity_kg` float NOT NULL,
  `price_per_kg` float NOT NULL,
  `owner_id` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `vendor_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `feed_stock`
--

INSERT INTO `feed_stock` (`id`, `name`, `type`, `quantity_kg`, `price_per_kg`, `owner_id`, `created_at`, `vendor_id`) VALUES
(1, 'SPLA', 'Pakan', 2, 25000, 1, '2025-11-23 21:37:00', 1),
(2, 'SPLA 2', 'Pakan', 44.43, 20000, 1, '2025-11-01 19:38:00', 1);

-- --------------------------------------------------------

--
-- Table structure for table `fish_mortality`
--

CREATE TABLE `fish_mortality` (
  `id` int(11) NOT NULL,
  `kolam_id` int(11) NOT NULL,
  `tanggal` date NOT NULL,
  `jumlah_mati` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `waktu` time DEFAULT NULL,
  `Keterangan` text DEFAULT NULL,
  `isi_kolam_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `fish_mortality`
--

INSERT INTO `fish_mortality` (`id`, `kolam_id`, `tanggal`, `jumlah_mati`, `created_at`, `waktu`, `Keterangan`, `isi_kolam_id`) VALUES
(1, 1, '2025-11-23', 1, '2025-11-23 14:54:02', '21:53:00', '', NULL),
(2, 1, '2025-11-23', 1, '2025-11-23 14:54:31', '21:54:31', '', NULL),
(3, 1, '2025-11-23', 26, '2025-11-23 15:35:23', '22:35:23', '', NULL),
(4, 3, '2025-11-24', 1, '2025-11-24 12:31:13', '19:31:00', '', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `fish_stock`
--

CREATE TABLE `fish_stock` (
  `id` int(11) NOT NULL,
  `species` varchar(100) NOT NULL,
  `avg_weight` float DEFAULT NULL,
  `quantity` int(11) NOT NULL,
  `total_kg` float DEFAULT NULL,
  `price_per_kg` float DEFAULT NULL,
  `size` varchar(20) DEFAULT '',
  `created_at` datetime DEFAULT current_timestamp(),
  `tanggal` date DEFAULT NULL,
  `price_per_unit` decimal(12,2) DEFAULT 0.00,
  `vendor_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `fish_stock`
--

INSERT INTO `fish_stock` (`id`, `species`, `avg_weight`, `quantity`, `total_kg`, `price_per_kg`, `size`, `created_at`, `tanggal`, `price_per_unit`, `vendor_id`) VALUES
(1, 'Lele - ABC', NULL, 348, 17.4, 50000, 'LBG', '2025-11-23 21:19:08', '2025-11-23', NULL, 1);

-- --------------------------------------------------------

--
-- Table structure for table `growth_log`
--

CREATE TABLE `growth_log` (
  `id` int(11) NOT NULL,
  `isi_kolam_id` int(11) DEFAULT NULL,
  `kolam_id` int(11) DEFAULT NULL,
  `berat_rata_ekor` decimal(10,2) DEFAULT NULL,
  `total_kg` double DEFAULT NULL,
  `tanggal` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `growth_log`
--

INSERT INTO `growth_log` (`id`, `isi_kolam_id`, `kolam_id`, `berat_rata_ekor`, `total_kg`, `tanggal`) VALUES
(4, 5, 1, NULL, 5.963, '2025-11-23 15:42:52'),
(5, 5, 1, NULL, 6.261, '2025-11-23 15:45:21'),
(6, 4, 2, NULL, 1.011, '2025-11-24 12:30:45');

-- --------------------------------------------------------

--
-- Table structure for table `isi_kolam`
--

CREATE TABLE `isi_kolam` (
  `id` int(11) NOT NULL,
  `kolam_id` int(11) NOT NULL,
  `ikan_id` int(11) NOT NULL,
  `tanggal_masuk` date NOT NULL,
  `jumlah_ekor` int(11) NOT NULL,
  `total_kg` decimal(10,3) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `harga_per_kg_snapshot` decimal(12,2) DEFAULT NULL,
  `harga_per_unit_snapshot` decimal(12,2) DEFAULT NULL,
  `ukuran_ikan_snapshot` varchar(50) DEFAULT NULL,
  `vendor_name_snapshot` varchar(100) DEFAULT NULL,
  `feed_cost_accum` decimal(14,2) NOT NULL DEFAULT 0.00,
  `vitamin_cost_accum` decimal(14,2) NOT NULL DEFAULT 0.00,
  `feed_kg_accum` decimal(12,3) NOT NULL DEFAULT 0.000,
  `vitamin_kg_accum` decimal(12,3) NOT NULL DEFAULT 0.000
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `isi_kolam`
--

INSERT INTO `isi_kolam` (`id`, `kolam_id`, `ikan_id`, `tanggal_masuk`, `jumlah_ekor`, `total_kg`, `created_at`, `harga_per_kg_snapshot`, `harga_per_unit_snapshot`, `ukuran_ikan_snapshot`, `vendor_name_snapshot`, `feed_cost_accum`, `vitamin_cost_accum`, `feed_kg_accum`, `vitamin_kg_accum`) VALUES
(4, 2, 1, '2025-11-23', 9, 0.910, '2025-11-23 08:35:01', 50000.00, NULL, 'Lele', 'Rudi', 9189.00, 0.00, 0.460, 0.000),
(5, 1, 1, '2025-11-23', 10, 6.261, '2025-11-23 08:35:51', 50000.00, NULL, 'Lele', 'Rudi', 115210.00, 0.00, 5.761, 0.000);

-- --------------------------------------------------------

--
-- Table structure for table `kolam`
--

CREATE TABLE `kolam` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `size` float NOT NULL,
  `location` varchar(255) DEFAULT NULL,
  `depth` float DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `owner_id` int(11) DEFAULT NULL,
  `status` enum('Kosong','Sedang Pemeliharaan','Siap Panen','Gagal Panen') NOT NULL DEFAULT 'Kosong',
  `jenis_kolam` varchar(100) DEFAULT NULL,
  `panjang` double DEFAULT NULL,
  `lebar` double DEFAULT NULL,
  `tinggi` double DEFAULT NULL,
  `diameter` double DEFAULT NULL,
  `biaya_pembuatan` float DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `kolam`
--

INSERT INTO `kolam` (`id`, `name`, `size`, `location`, `depth`, `description`, `owner_id`, `status`, `jenis_kolam`, `panjang`, `lebar`, `tinggi`, `diameter`, `biaya_pembuatan`) VALUES
(1, 'ABC', 0, 'Bulat', 0, 'Bulat', 1, 'Sedang Pemeliharaan', 'Bulat', NULL, NULL, 2, 4, 0),
(2, 'A', 0, 'Bulat', 0, 'Bulat', 1, 'Sedang Pemeliharaan', 'Bulat', NULL, NULL, 4, 6, 0),
(3, 'C', 0, 'Bulat', 0, 'Bulat', 1, 'Kosong', 'Bulat', NULL, NULL, 2, 5, 0),
(4, 'X', 0, 'Bulat', 0, 'Bulat', 1, 'Kosong', 'Bulat', NULL, NULL, 2, 5, 0);

-- --------------------------------------------------------

--
-- Table structure for table `kolam_log`
--

CREATE TABLE `kolam_log` (
  `id` int(11) NOT NULL,
  `kolam_id` int(11) DEFAULT NULL,
  `action` text DEFAULT NULL,
  `created_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `kolam_log`
--

INSERT INTO `kolam_log` (`id`, `kolam_id`, `action`, `created_at`) VALUES
(1, 2, 'panen-penuh', '2025-11-23 15:34:44'),
(2, NULL, 'Kolam dihapus: AX', '2025-11-24 13:20:26');

-- --------------------------------------------------------

--
-- Table structure for table `kolam_logs`
--

CREATE TABLE `kolam_logs` (
  `id` int(11) NOT NULL,
  `kolam_id` int(11) DEFAULT NULL,
  `action` varchar(255) NOT NULL,
  `created_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `panen`
--

CREATE TABLE `panen` (
  `id` int(11) NOT NULL,
  `kolam_id` int(11) NOT NULL,
  `tanggal` date NOT NULL,
  `total_berat_kg` decimal(10,2) NOT NULL,
  `harga_jual` decimal(10,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `isi_kolam_id` int(11) DEFAULT NULL,
  `jumlah_ekor` int(11) DEFAULT NULL,
  `berat_rata_ekor` decimal(10,2) DEFAULT NULL,
  `hpp_total` decimal(14,2) DEFAULT NULL,
  `total_pakan_kg` decimal(10,3) DEFAULT NULL,
  `tipe_panen` enum('penuh','parsial') NOT NULL DEFAULT 'penuh',
  `expected_kg` decimal(10,3) DEFAULT NULL,
  `susut_kg` decimal(10,3) DEFAULT NULL,
  `susut_percent` decimal(5,2) DEFAULT NULL,
  `nilai_aset_diambil` decimal(14,2) DEFAULT NULL,
  `biaya_pakan_ambil` decimal(14,2) DEFAULT NULL,
  `biaya_vitamin_ambil` decimal(14,2) DEFAULT NULL,
  `hpp` decimal(14,2) DEFAULT NULL,
  `laba_rugi` decimal(14,2) DEFAULT NULL,
  `fcr` decimal(6,3) DEFAULT NULL,
  `vendor_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `panen`
--

INSERT INTO `panen` (`id`, `kolam_id`, `tanggal`, `total_berat_kg`, `harga_jual`, `created_at`, `isi_kolam_id`, `jumlah_ekor`, `berat_rata_ekor`, `hpp_total`, `total_pakan_kg`, `tipe_panen`, `expected_kg`, `susut_kg`, `susut_percent`, `nilai_aset_diambil`, `biaya_pakan_ambil`, `biaya_vitamin_ambil`, `hpp`, `laba_rugi`, `fcr`, `vendor_id`) VALUES
(1, 2, '2025-11-23', 223.00, 50000.00, '2025-11-23 15:34:44', NULL, 4, 55.75, 16500.00, 0.000, 'penuh', 0.293, -222.707, -999.99, 14650.00, 1850.00, 0.00, NULL, 11133500.00, 0.000, 1);

-- --------------------------------------------------------

--
-- Table structure for table `pemberian_pakan`
--

CREATE TABLE `pemberian_pakan` (
  `id` int(11) NOT NULL,
  `kolam_id` int(11) NOT NULL,
  `stok_pakan_id` int(11) NOT NULL,
  `tanggal` date NOT NULL,
  `jumlah_kg` decimal(10,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `isi_kolam_id` int(11) DEFAULT NULL,
  `waktu` time DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `pemberian_pakan`
--

INSERT INTO `pemberian_pakan` (`id`, `kolam_id`, `stok_pakan_id`, `tanggal`, `jumlah_kg`, `created_at`, `isi_kolam_id`, `waktu`) VALUES
(1, 1, 2, '2025-11-23', 2.00, '2025-11-23 14:53:52', NULL, '21:53:00'),
(2, 1, 2, '2025-11-23', 0.22, '2025-11-23 15:33:08', NULL, '22:32:00'),
(3, 1, 2, '2025-11-25', 5.00, '2025-11-23 15:42:52', NULL, '22:42:00'),
(4, 1, 2, '2025-11-11', 0.30, '2025-11-23 15:45:21', NULL, '22:45:00'),
(5, 2, 2, '2025-11-01', 0.05, '2025-11-24 12:30:45', NULL, '15:30:00');

-- --------------------------------------------------------

--
-- Table structure for table `pemilik_petani_kolam`
--

CREATE TABLE `pemilik_petani_kolam` (
  `id` int(11) NOT NULL,
  `pemilik_id` int(11) NOT NULL,
  `petani_id` int(11) NOT NULL,
  `kolam_id` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reference_aktivitas_kolam`
--

CREATE TABLE `reference_aktivitas_kolam` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reference_jenis_kolam`
--

CREATE TABLE `reference_jenis_kolam` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `reference_jenis_kolam`
--

INSERT INTO `reference_jenis_kolam` (`id`, `name`, `description`, `created_at`, `updated_at`) VALUES
(1, 'Bulat', '', '2025-11-23 14:16:47', '2025-11-23 14:16:47');

-- --------------------------------------------------------

--
-- Table structure for table `reference_status_kolam_ikan`
--

CREATE TABLE `reference_status_kolam_ikan` (
  `id` int(11) NOT NULL,
  `name` varchar(50) NOT NULL,
  `description` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reference_ukuran_ikan`
--

CREATE TABLE `reference_ukuran_ikan` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `ukuran` varchar(100) DEFAULT NULL,
  `tipe_harga` enum('ukuran','berat') NOT NULL,
  `description` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `reference_ukuran_ikan`
--

INSERT INTO `reference_ukuran_ikan` (`id`, `name`, `ukuran`, `tipe_harga`, `description`, `created_at`, `updated_at`) VALUES
(1, 'Lele', 'LBG', 'berat', '', '2025-11-23 14:16:56', '2025-11-23 14:17:01');

-- --------------------------------------------------------

--
-- Table structure for table `ref_vendor`
--

CREATE TABLE `ref_vendor` (
  `id` int(11) NOT NULL,
  `name` varchar(150) NOT NULL,
  `alamat` varchar(255) DEFAULT NULL,
  `tanggal_daftar` date DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `Nomor_HP` varchar(13) DEFAULT NULL,
  `bp_code` varchar(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `ref_vendor`
--

INSERT INTO `ref_vendor` (`id`, `name`, `alamat`, `tanggal_daftar`, `created_at`, `Nomor_HP`, `bp_code`) VALUES
(1, 'Rudi', 'Kp. Campaka', '2025-11-12', '2025-11-23 21:17:17', '+628382129244', 'BP0001');

-- --------------------------------------------------------

--
-- Table structure for table `sensor_data`
--

CREATE TABLE `sensor_data` (
  `id` int(11) NOT NULL,
  `kolam_id` int(11) NOT NULL,
  `suhu` decimal(5,2) DEFAULT NULL,
  `ph` decimal(5,2) DEFAULT NULL,
  `oksigen` decimal(5,2) DEFAULT NULL,
  `waktu` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `transaksi_keuangan`
--

CREATE TABLE `transaksi_keuangan` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `kategori` enum('pemasukan','pengeluaran') NOT NULL,
  `deskripsi` varchar(255) DEFAULT NULL,
  `jumlah` decimal(15,2) NOT NULL,
  `tanggal` date NOT NULL,
  `panen_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `transaksi_keuangan`
--

INSERT INTO `transaksi_keuangan` (`id`, `user_id`, `kategori`, `deskripsi`, `jumlah`, `tanggal`, `panen_id`, `created_at`) VALUES
(1, 1, 'pengeluaran', 'Pembelian ikan Lele - ABC ukuran LBG (20 kg)', 1000000.00, '2025-11-23', NULL, '2025-11-23 07:19:08'),
(2, 1, 'pengeluaran', 'Pembelian awal pakan X (1 kg)', 10000.00, '2025-11-23', NULL, '2025-11-23 07:41:09'),
(3, 1, 'pemasukan', 'Reversal pembelian pakan X (batal beli)', 10000.00, '2025-11-23', NULL, '2025-11-23 07:43:11'),
(4, 1, 'pengeluaran', 'Tambah stok pakan SPLA 2 (2 kg)', 40000.00, '2025-11-23', NULL, '2025-11-23 08:08:05'),
(5, 1, 'pemasukan', 'Panen A (penuh)', 11150000.00, '2025-11-23', 1, '2025-11-23 08:34:44'),
(6, 1, 'pengeluaran', 'Pembuatan kolam: AX', 5000000.00, '2025-11-24', NULL, '2025-11-24 06:10:11'),
(7, 1, 'pemasukan', 'Refund pembatalan kolam: AX', 5000000.00, '2025-11-24', NULL, '2025-11-24 06:20:26');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','pemilik','petani') DEFAULT 'petani',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `username`, `email`, `password`, `role`, `created_at`) VALUES
(1, 'bagas31@gmail.com', 'bagas31@gmail.com', '$2b$12$9nansjvQkxfWtRg97u/Nvu29l8F.vS/zhs9ZGzRAv4SgeU1Ljw/Ei', 'pemilik', '2025-11-23 07:16:01');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `aktivitas`
--
ALTER TABLE `aktivitas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_ak_kolam_waktu` (`kolam_id`,`waktu`),
  ADD KEY `idx_ak_user_waktu` (`user_id`,`waktu`),
  ADD KEY `idx_ak_aksi` (`aksi`),
  ADD KEY `idx_ak_panen` (`panen_id`),
  ADD KEY `idx_ak_isi` (`isi_kolam_id`);

--
-- Indexes for table `feed_logs`
--
ALTER TABLE `feed_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `feed_id` (`feed_id`),
  ADD KEY `ix_feed_logs_id` (`id`),
  ADD KEY `fk_feedlogs_isikolam` (`isi_kolam_id`),
  ADD KEY `idx_feedlogs_kolam_tanggal` (`kolam_id`,`tanggal`);

--
-- Indexes for table `feed_stock`
--
ALTER TABLE `feed_stock`
  ADD PRIMARY KEY (`id`),
  ADD KEY `owner_id` (`owner_id`),
  ADD KEY `fk_feed_vendor` (`vendor_id`);

--
-- Indexes for table `fish_mortality`
--
ALTER TABLE `fish_mortality`
  ADD PRIMARY KEY (`id`),
  ADD KEY `kolam_id` (`kolam_id`),
  ADD KEY `fish_mortality_ibfk_2` (`isi_kolam_id`);

--
-- Indexes for table `fish_stock`
--
ALTER TABLE `fish_stock`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_fish_vendor` (`vendor_id`);

--
-- Indexes for table `growth_log`
--
ALTER TABLE `growth_log`
  ADD PRIMARY KEY (`id`),
  ADD KEY `kolam_id` (`kolam_id`),
  ADD KEY `ix_growth_log_id` (`id`),
  ADD KEY `growth_log_ibfk_1` (`isi_kolam_id`);

--
-- Indexes for table `isi_kolam`
--
ALTER TABLE `isi_kolam`
  ADD PRIMARY KEY (`id`),
  ADD KEY `isi_kolam_ibfk_1` (`kolam_id`),
  ADD KEY `isi_kolam_ibfk_2` (`ikan_id`);

--
-- Indexes for table `kolam`
--
ALTER TABLE `kolam`
  ADD PRIMARY KEY (`id`),
  ADD KEY `owner_id` (`owner_id`),
  ADD KEY `ix_kolam_id` (`id`);

--
-- Indexes for table `kolam_log`
--
ALTER TABLE `kolam_log`
  ADD PRIMARY KEY (`id`),
  ADD KEY `ix_kolam_log_id` (`id`),
  ADD KEY `kolam_log_ibfk_1` (`kolam_id`);

--
-- Indexes for table `kolam_logs`
--
ALTER TABLE `kolam_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `kolam_id` (`kolam_id`),
  ADD KEY `ix_kolam_logs_id` (`id`);

--
-- Indexes for table `panen`
--
ALTER TABLE `panen`
  ADD PRIMARY KEY (`id`),
  ADD KEY `kolam_id` (`kolam_id`),
  ADD KEY `panen_ibfk_2` (`isi_kolam_id`),
  ADD KEY `fk_panen_vendor_id` (`vendor_id`);

--
-- Indexes for table `pemberian_pakan`
--
ALTER TABLE `pemberian_pakan`
  ADD PRIMARY KEY (`id`),
  ADD KEY `kolam_id` (`kolam_id`),
  ADD KEY `pemberian_pakan_ibfk_2` (`stok_pakan_id`),
  ADD KEY `pemberian_pakan_ibfk_3` (`isi_kolam_id`);

--
-- Indexes for table `pemilik_petani_kolam`
--
ALTER TABLE `pemilik_petani_kolam`
  ADD PRIMARY KEY (`id`),
  ADD KEY `pemilik_id` (`pemilik_id`),
  ADD KEY `petani_id` (`petani_id`),
  ADD KEY `kolam_id` (`kolam_id`);

--
-- Indexes for table `reference_aktivitas_kolam`
--
ALTER TABLE `reference_aktivitas_kolam`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `reference_jenis_kolam`
--
ALTER TABLE `reference_jenis_kolam`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `reference_status_kolam_ikan`
--
ALTER TABLE `reference_status_kolam_ikan`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `reference_ukuran_ikan`
--
ALTER TABLE `reference_ukuran_ikan`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `ref_vendor`
--
ALTER TABLE `ref_vendor`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `bp_code` (`bp_code`),
  ADD KEY `idx_ref_vendor_created_at` (`created_at`);

--
-- Indexes for table `sensor_data`
--
ALTER TABLE `sensor_data`
  ADD PRIMARY KEY (`id`),
  ADD KEY `kolam_id` (`kolam_id`);

--
-- Indexes for table `transaksi_keuangan`
--
ALTER TABLE `transaksi_keuangan`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `fk_transaksi_panen` (`panen_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD UNIQUE KEY `email` (`email`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `aktivitas`
--
ALTER TABLE `aktivitas`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;

--
-- AUTO_INCREMENT for table `feed_logs`
--
ALTER TABLE `feed_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `feed_stock`
--
ALTER TABLE `feed_stock`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `fish_mortality`
--
ALTER TABLE `fish_mortality`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `fish_stock`
--
ALTER TABLE `fish_stock`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `growth_log`
--
ALTER TABLE `growth_log`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `isi_kolam`
--
ALTER TABLE `isi_kolam`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `kolam`
--
ALTER TABLE `kolam`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `kolam_log`
--
ALTER TABLE `kolam_log`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `kolam_logs`
--
ALTER TABLE `kolam_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `panen`
--
ALTER TABLE `panen`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `pemberian_pakan`
--
ALTER TABLE `pemberian_pakan`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `pemilik_petani_kolam`
--
ALTER TABLE `pemilik_petani_kolam`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reference_aktivitas_kolam`
--
ALTER TABLE `reference_aktivitas_kolam`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reference_jenis_kolam`
--
ALTER TABLE `reference_jenis_kolam`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `reference_status_kolam_ikan`
--
ALTER TABLE `reference_status_kolam_ikan`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reference_ukuran_ikan`
--
ALTER TABLE `reference_ukuran_ikan`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `ref_vendor`
--
ALTER TABLE `ref_vendor`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `sensor_data`
--
ALTER TABLE `sensor_data`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transaksi_keuangan`
--
ALTER TABLE `transaksi_keuangan`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `feed_logs`
--
ALTER TABLE `feed_logs`
  ADD CONSTRAINT `feed_logs_ibfk_1` FOREIGN KEY (`kolam_id`) REFERENCES `kolam` (`id`),
  ADD CONSTRAINT `feed_logs_ibfk_2` FOREIGN KEY (`feed_id`) REFERENCES `feed_stock` (`id`),
  ADD CONSTRAINT `fk_feedlogs_isikolam` FOREIGN KEY (`isi_kolam_id`) REFERENCES `isi_kolam` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `feed_stock`
--
ALTER TABLE `feed_stock`
  ADD CONSTRAINT `feed_stock_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_feed_vendor` FOREIGN KEY (`vendor_id`) REFERENCES `ref_vendor` (`id`);

--
-- Constraints for table `fish_mortality`
--
ALTER TABLE `fish_mortality`
  ADD CONSTRAINT `fish_mortality_ibfk_1` FOREIGN KEY (`kolam_id`) REFERENCES `kolam` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fish_mortality_ibfk_2` FOREIGN KEY (`isi_kolam_id`) REFERENCES `isi_kolam` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `fish_stock`
--
ALTER TABLE `fish_stock`
  ADD CONSTRAINT `fk_fish_vendor` FOREIGN KEY (`vendor_id`) REFERENCES `ref_vendor` (`id`);

--
-- Constraints for table `growth_log`
--
ALTER TABLE `growth_log`
  ADD CONSTRAINT `growth_log_ibfk_1` FOREIGN KEY (`isi_kolam_id`) REFERENCES `isi_kolam` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `growth_log_ibfk_2` FOREIGN KEY (`kolam_id`) REFERENCES `kolam` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `isi_kolam`
--
ALTER TABLE `isi_kolam`
  ADD CONSTRAINT `isi_kolam_ibfk_1` FOREIGN KEY (`kolam_id`) REFERENCES `kolam` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `isi_kolam_ibfk_2` FOREIGN KEY (`ikan_id`) REFERENCES `fish_stock` (`id`);

--
-- Constraints for table `kolam`
--
ALTER TABLE `kolam`
  ADD CONSTRAINT `kolam_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `kolam_log`
--
ALTER TABLE `kolam_log`
  ADD CONSTRAINT `kolam_log_ibfk_1` FOREIGN KEY (`kolam_id`) REFERENCES `kolam` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `kolam_logs`
--
ALTER TABLE `kolam_logs`
  ADD CONSTRAINT `kolam_logs_ibfk_1` FOREIGN KEY (`kolam_id`) REFERENCES `kolam` (`id`);

--
-- Constraints for table `panen`
--
ALTER TABLE `panen`
  ADD CONSTRAINT `fk_panen_vendor_id` FOREIGN KEY (`vendor_id`) REFERENCES `ref_vendor` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `panen_ibfk_2` FOREIGN KEY (`isi_kolam_id`) REFERENCES `isi_kolam` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `pemberian_pakan`
--
ALTER TABLE `pemberian_pakan`
  ADD CONSTRAINT `pemberian_pakan_ibfk_2` FOREIGN KEY (`stok_pakan_id`) REFERENCES `feed_stock` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `pemberian_pakan_ibfk_3` FOREIGN KEY (`isi_kolam_id`) REFERENCES `isi_kolam` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `pemilik_petani_kolam`
--
ALTER TABLE `pemilik_petani_kolam`
  ADD CONSTRAINT `pemilik_petani_kolam_ibfk_1` FOREIGN KEY (`pemilik_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `pemilik_petani_kolam_ibfk_2` FOREIGN KEY (`petani_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `pemilik_petani_kolam_ibfk_3` FOREIGN KEY (`kolam_id`) REFERENCES `kolam` (`id`);

--
-- Constraints for table `transaksi_keuangan`
--
ALTER TABLE `transaksi_keuangan`
  ADD CONSTRAINT `fk_transaksi_panen` FOREIGN KEY (`panen_id`) REFERENCES `panen` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `transaksi_keuangan_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
