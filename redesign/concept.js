import { directions } from './directions.js';

const params = new URLSearchParams(location.search);
const direction = directions.find(item => item.id === params.get('direction')) || directions[0];
const { id, name, number } = direction;
document.body.classList.add(id);
if (params.has('embed')) document.body.classList.add('embedded');
document.title = `Vika · ${name}`;

const arrow = '<span aria-hidden="true">↗</span>';
const action = `<a class="cta" href="#start">Trải nghiệm Vika ${arrow}</a>`;
const intro = 'Vika dùng camera điện thoại để đếm rep và hướng dẫn chỉnh form bằng tiếng Việt. Tập theo lộ trình của riêng bạn, ngay tại nhà.';
const headline = '<span>Tập tại nhà.</span><span>Có Vika</span><span>hướng dẫn.</span>';
const kicker = '<p class="eyebrow">HUẤN LUYỆN VIÊN AI TẠI NHÀ</p>';
const sub = `<p class="intro">${intro}</p>`;
const actions = `<div class="hero-actions">${action}<a class="text-link" href="#how">Vika hoạt động thế nào <span aria-hidden="true">↓</span></a></div>`;
const homeImage = (className = '') => `<img class="${className}" src="assets/training-home.jpg" width="1536" height="1024" alt="Tập lunge trên thảm ngay trong phòng khách" fetchpriority="high">`;
const phone = (screen, className = '') => `<div class="phone ${className}"><img src="assets/app-${screen}.png" alt="${screen === 'workout' ? 'Vika đếm rep trong buổi tập lunge' : screen === 'feedback' ? 'Vika tổng kết sau hiệp tập' : 'Buổi tập và các động tác trong ứng dụng Vika'}" width="588" height="1280" decoding="async"></div>`;

const hero = {
  everyday: `<section class="hero"><div class="hero-copy">${kicker}<h1>${headline}</h1>${sub}${actions}<p class="small-note">Dành cho người mới. Phù hợp với nhịp sống của bạn.</p></div><figure class="hero-visual">${homeImage()}<figcaption><span>Góc tập của bạn.</span><span>Ngay tại nhà. ${arrow}</span></figcaption><div class="photo-label"><span class="live-dot"></span> Bắt đầu từ một khoảng trống nhỏ.</div></figure></section>`,
  studio: `<section class="hero"><div class="studio-meta"><span>VIKA TRAINING CLUB</span><span>CHO NGƯỜI VIỆT · TẬP TẠI NHÀ</span></div><div class="hero-copy">${kicker}<h1>${headline}</h1>${sub}${actions}</div><figure class="hero-visual">${homeImage()}<figcaption><span>Chỉ cần điện thoại.</span><span>Vika hướng dẫn bạn.</span></figcaption></figure><div class="studio-footer"><span>ĐẾM REP.</span><span>CHỈNH FORM.</span><span>LỘ TRÌNH RIÊNG.</span></div></section>`,
  product: `<section class="hero"><div class="hero-copy">${kicker}<h1>Tập tại nhà.<br>Có Vika hướng dẫn.</h1>${sub}${actions}</div><div class="product-stage"><div class="side-note"><span class="note-line"></span><p>Vika đếm rep,<br><strong>chỉnh form.</strong></p><small>Ảnh từ ứng dụng Vika</small></div><div class="device-pair">${phone('plan','phone-secondary')}${phone('workout','phone-primary')}</div><div class="side-note"><span class="note-line"></span><p>Lộ trình<br><strong>của riêng bạn.</strong></p><small>Theo dõi từng buổi tập</small></div></div></section>`,
  quiet: `<section class="hero"><div class="hero-backdrop">${homeImage()}</div><div class="hero-copy">${kicker}<h1>${headline}</h1><p class="intro">${intro}</p>${actions}</div><div class="quiet-caption"><span>Một chiếc điện thoại.<br>Một khoảng trống của riêng bạn.</span><a href="#demo" aria-label="Xem ứng dụng Vika">↓</a></div></section>`,
  journal: `<section class="hero"><div class="journal-meta"><span>VUI · KHOẺ · AN TOÀN</span><span>TẬP LUYỆN THEO CÁCH CỦA BẠN</span></div><div class="hero-copy">${kicker}<h1>${headline}</h1></div><figure class="hero-visual">${homeImage()}<figcaption><span>01 / Góc tập tại nhà</span><span>VIKA ${arrow}</span></figcaption></figure><div class="journal-intro">${sub}${actions}</div><nav class="journal-index" aria-label="Mục lục trang"><span>KHÁM PHÁ VIKA</span><a href="#demo">01 &nbsp; Ứng dụng</a><a href="#how">02 &nbsp; Cách bắt đầu</a><a href="#questions">03 &nbsp; Câu hỏi thường gặp</a></nav></section>`,
}[id];

document.getElementById('site').innerHTML = `
  <header class="header">
    <a class="brand" href="#main" aria-label="Vika, về đầu trang"><img src="../vika-wordmark-blacktext.png" width="486" height="164" alt="VIKA"></a>
    <nav class="desktop-nav" aria-label="Điều hướng chính"><a href="#demo">Khám phá Vika</a><a href="#how">Cách hoạt động</a><a href="#questions">Câu hỏi thường gặp</a></nav>
    <a class="header-cta" href="#start">Trải nghiệm Vika ${arrow}</a>
    <details class="mobile-menu"><summary aria-label="Menu điều hướng"><span>Menu</span><span aria-hidden="true">+</span></summary><nav aria-label="Điều hướng trên điện thoại"><a href="#demo">Khám phá Vika</a><a href="#how">Cách hoạt động</a><a href="#questions">Câu hỏi thường gặp</a><a href="#start">Trải nghiệm Vika</a></nav></details>
  </header>
  <main id="main">
    ${hero}
    <div class="principles"><p>Tập theo lộ trình của bạn</p><span aria-hidden="true">✳</span><p>Hướng dẫn bằng tiếng Việt</p><span aria-hidden="true">✳</span><p>Ngay trên điện thoại</p></div>
    <section class="demo section" id="demo">
      <div class="section-label"><span>01</span><p>VIKA TRONG BUỔI TẬP</p></div>
      <div class="demo-copy"><h2>Vika đếm rep,<br>chỉnh form.</h2><p>Bạn tập trung vào động tác. Vika đếm số lần tập và hướng dẫn bằng giọng nói. Sau mỗi hiệp, xem lại kết quả ngay trong ứng dụng.</p>
        <div class="screen-options" role="group" aria-label="Chọn màn hình ứng dụng">
          <button type="button" data-screen="workout" aria-pressed="true"><span>01</span><span>Trong lúc tập<small>Đếm rep và hướng dẫn chỉnh form</small></span><span aria-hidden="true">↗</span></button>
          <button type="button" data-screen="feedback" aria-pressed="false"><span>02</span><span>Sau mỗi hiệp<small>Xem lại kết quả tập luyện</small></span><span aria-hidden="true">↗</span></button>
          <button type="button" data-screen="plan" aria-pressed="false"><span>03</span><span>Lộ trình của bạn<small>Biết buổi tiếp theo mình sẽ tập gì</small></span><span aria-hidden="true">↗</span></button>
        </div>
      </div>
      <figure class="demo-visual"><div class="demo-orbit" aria-hidden="true"></div>${phone('workout','demo-phone')}<figcaption id="screen-caption" aria-live="polite">Trong lúc tập · Ảnh từ ứng dụng Vika</figcaption></figure>
    </section>
    <section class="how section" id="how">
      <div class="section-label"><span>02</span><p>BẮT ĐẦU CÙNG VIKA</p></div>
      <div class="how-heading"><h2>Góc tập của bạn.<br>Lộ trình của bạn.</h2><p>Không cần phải biết mọi thứ từ đầu. Vika hướng dẫn bạn làm quen, từng bước một.</p></div>
      <div class="how-layout"><figure class="how-photo"><img src="../Box%202.png" alt="Đặt điện thoại tựa vào tường trước buổi tập" width="1402" height="1122" loading="lazy"><figcaption>Đặt điện thoại. Dành một khoảng trống để tập.</figcaption></figure><ol class="steps"><li><span>01</span><div><h3>Chọn mục tiêu của bạn</h3><p>Cho Vika biết kinh nghiệm, thời gian và mục tiêu tập luyện.</p></div></li><li><span>02</span><div><h3>Đặt điện thoại và tập</h3><p>Làm theo hướng dẫn thiết lập camera trước khi bắt đầu buổi tập.</p></div></li><li><span>03</span><div><h3>Xem lại kết quả</h3><p>Theo dõi từng hiệp và tiếp tục với lộ trình của riêng bạn.</p></div></li></ol></div>
    </section>
    <section class="questions section" id="questions"><div class="section-label"><span>03</span><p>TRƯỚC KHI BẮT ĐẦU</p></div><div class="questions-layout"><div><h2>Bạn muốn<br>biết thêm?</h2><a class="text-link" href="../support.html">Liên hệ Vika ${arrow}</a></div><div class="question-list"><details><summary>Tôi mới tập, có dùng Vika được không?<span aria-hidden="true">+</span></summary><p>Vika dành cho cả người mới tập. Bạn chọn mục tiêu và kinh nghiệm khi bắt đầu để có lộ trình phù hợp.</p></details><details><summary>Tôi cần chuẩn bị những gì?<span aria-hidden="true">+</span></summary><p>Một chiếc điện thoại có camera và một khoảng trống để thực hiện động tác. Vika hướng dẫn cách đặt điện thoại trước buổi tập.</p></details><details><summary>Vika dùng camera để làm gì?<span aria-hidden="true">+</span></summary><p>Camera giúp ứng dụng nhận diện chuyển động, đếm rep và hỗ trợ chỉnh form. <a href="../privacy.html">Đọc chính sách quyền riêng tư</a> để biết cách Vika xử lý dữ liệu.</p></details><details><summary>Tôi có thể tìm hiểu thêm ở đâu?<span aria-hidden="true">+</span></summary><p>Xem <a href="../about.html">câu chuyện Vika</a> hoặc <a href="../support.html">liên hệ đội ngũ</a> nếu bạn cần hỗ trợ.</p></details></div></div></section>
    <section class="start" id="start"><div><p class="eyebrow">BẮT ĐẦU CÙNG VIKA</p><h2>Buổi tập tiếp theo,<br>có Vika hướng dẫn.</h2><a class="cta" href="../index.html#download">Trải nghiệm Vika ${arrow}</a></div><span class="start-wordmark" aria-hidden="true">vika.</span></section>
  </main>
  <footer><div class="footer-top"><a class="brand" href="#main" aria-label="Vika, về đầu trang"><img src="../vika-wordmark-blacktext.png" width="486" height="164" alt="VIKA"></a><p>Huấn luyện viên AI tại nhà.<br>Dành cho người Việt.</p><nav aria-label="Thông tin Vika"><a href="../about.html">Về Vika</a><a href="../support.html">Hỗ trợ</a><a href="../privacy.html">Quyền riêng tư</a></nav></div><div class="footer-bottom"><small>© 2026 Vika</small><small>Vika hỗ trợ tập luyện, không thay thế tư vấn y tế.</small></div></footer>
  <aside class="preview-note" aria-label="Thông tin bản xem trước"><a href="index.html">← All directions</a><span>${number} / ${name}</span><span>Preview · Signup links to current site</span></aside>
`;

const screenData = {
  workout: { text: 'Trong lúc tập', alt: 'Vika đếm rep trong buổi tập lunge' },
  feedback: { text: 'Sau mỗi hiệp', alt: 'Vika tổng kết sau hiệp tập' },
  plan: { text: 'Lộ trình của bạn', alt: 'Buổi tập và các động tác trong ứng dụng Vika' },
};

document.querySelectorAll('[data-screen]').forEach(button => button.addEventListener('click', () => {
  const screen = button.dataset.screen;
  const image = document.querySelector('.demo-phone img');
  image.src = `assets/app-${screen}.png`;
  image.alt = screenData[screen].alt;
  document.querySelectorAll('[data-screen]').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
  document.getElementById('screen-caption').textContent = `${screenData[screen].text} · Ảnh từ ứng dụng Vika`;
}));

const mobileMenu = document.querySelector('.mobile-menu');
mobileMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => { mobileMenu.open = false; }));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && mobileMenu.open) {
    mobileMenu.open = false;
    mobileMenu.querySelector('summary').focus();
  }
});
