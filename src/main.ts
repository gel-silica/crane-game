import './style.css'
import Phaser from 'phaser'

// アームの状態を表す型
type ArmState = 'IDLE' | 'EXTENDING' | 'RETRACTING' | 'DELIVERING';

// ゲームの状態を表す型
type GameState = 'PLAYING' | 'GAME_OVER';

class MainScene extends Phaser.Scene {
  private crane!: Phaser.Physics.Arcade.Sprite;
  private arm!: Phaser.GameObjects.Graphics; // クレーンアーム用のグラフィックスオブジェクト
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private moveSpeed: number = 200;
  
  // アームの状態管理用の変数
  private armLength: number = 0;
  private maxArmLength: number = 400;
  private armSpeed: number = 3; // 少し遅くして操作性を向上
  private armState: ArmState = 'IDLE';
  
  // 景品とキャッチ関連のプロパティ
  private prizes!: Phaser.Physics.Arcade.Group;
  private ground!: Phaser.Physics.Arcade.StaticGroup;
  private caughtPrize: Phaser.Physics.Arcade.Sprite | null = null;
  private hookPoint = { x: 0, y: 0 }; // フックの座標
  private catchMessage?: Phaser.GameObjects.Text;
  private messageTimer?: Phaser.Time.TimerEvent;
  
  // 自動移動関連のプロパティ
  private dropZoneX: number = 0; // 落とし口の中央X座標（create内で設定）
  private deliverySpeed: number = 100; // 自動移動時の速度

  // スコアとトライ回数の管理
  private score: number = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private maxTries: number = 5;
  private triesLeft: number = 5;
  private triesText!: Phaser.GameObjects.Text;
  private gameState: GameState = 'PLAYING';
  private gameOverText!: Phaser.GameObjects.Text;
  
  // 落とし口エリア関連のプロパティ
  private dropZoneLeft!: Phaser.Physics.Arcade.Image;
  private dropZoneRight!: Phaser.Physics.Arcade.Image;
  private dropZoneBottom!: Phaser.Physics.Arcade.Image;
  private collectedPrizes: Set<Phaser.Physics.Arcade.Sprite> = new Set(); // 既に獲得済みの景品を管理

  constructor() {
    super('MainScene')
  }

  preload() {
    // アセットの読み込み処理
    console.log('Preloading assets...')
    // クレーンの画像を読み込み
    this.load.image('crane', 'assets/crane.png');
    // 景品の画像を読み込み
    this.load.image('prize', 'assets/prize.png');
  }

  create() {
    // 背景色を設定
    this.cameras.main.setBackgroundColor('#f0f0f0')
    
    // クレーンのスプライトを画面上部の右寄りに配置（落とし口と干渉しないように）
    this.crane = this.physics.add.sprite(
      this.cameras.main.centerX + 50, // 中央より右側に配置
      100, 
      'crane'
    );
    
    // クレーン画像のリサイズ（元画像が1024x1536と大きいため）
    this.crane.setScale(0.1); 
    
    // クレーンの当たり判定（ヒットボックス）を調整
    if (this.crane.body) {
      this.crane.body.setSize(this.crane.displayWidth * 0.8, this.crane.displayHeight * 0.8);
      this.crane.body.setOffset(this.crane.displayWidth * 0.1, this.crane.displayHeight * 0.1);
      // クレーンの物理特性を追加設定
      this.crane.body.immovable = true; // 完全に固定 (setImmovableではなくimmovableを使用)
      (this.crane.body as Phaser.Physics.Arcade.Body).setAllowGravity(false); // 重力の影響を受けない
    }
    
    // クレーンアーム用のグラフィックスオブジェクトを作成
    this.arm = this.add.graphics({
      lineStyle: {
        width: 4,
        color: 0x000000,
        alpha: 1
      }
    });
    

    this.arm.moveTo(this.crane.x, this.crane.y);
    this.armLength = 0;
    this.drawArm();
    
    // 落とし口エリアを作成（画面下部左側）
    const dropZoneWidth = 150;
    const dropZoneHeight = 100;
    const dropZoneX = dropZoneWidth / 2; // 左端から配置
    const groundHeight = 20;
    const dropZoneY = this.cameras.main.height - groundHeight * 2 - dropZoneHeight / 2;
    
    // 落とし口のX座標を保存（自動移動用）
    this.dropZoneX = dropZoneX;
    
    // 落とし口の視覚的表現（背景のみ）- 変数宣言を省略して直接メソッドチェーンを使用
    this.add.rectangle(
      dropZoneX, 
      dropZoneY, 
      dropZoneWidth, 
      dropZoneHeight,
      0x0000ff, // 青色
      0.2 // 透明度
    );
    
    // 落とし口の境界壁を作成（左・右・底の3辺）
    // 左壁
    this.dropZoneLeft = this.physics.add.staticImage(
      dropZoneX - dropZoneWidth / 2, 
      dropZoneY, 
      'crane'
    ) as Phaser.Physics.Arcade.Image;
    this.dropZoneLeft.setVisible(false);
    this.dropZoneLeft.setDisplaySize(10, dropZoneHeight);
    this.physics.world.enableBody(this.dropZoneLeft, Phaser.Physics.Arcade.STATIC_BODY);
    
    // 右壁
    this.dropZoneRight = this.physics.add.staticImage(
      dropZoneX + dropZoneWidth / 2, 
      dropZoneY, 
      'crane'
    ) as Phaser.Physics.Arcade.Image;
    this.dropZoneRight.setVisible(false);
    this.dropZoneRight.setDisplaySize(10, dropZoneHeight);
    this.physics.world.enableBody(this.dropZoneRight, Phaser.Physics.Arcade.STATIC_BODY);
    
    // 底面
    this.dropZoneBottom = this.physics.add.staticImage(
      dropZoneX, 
      dropZoneY + dropZoneHeight / 2, 
      'crane'
    ) as Phaser.Physics.Arcade.Image;
    this.dropZoneBottom.setVisible(false);
    this.dropZoneBottom.setDisplaySize(dropZoneWidth, 10);
    this.physics.world.enableBody(this.dropZoneBottom, Phaser.Physics.Arcade.STATIC_BODY);
    
    // 落とし口のラベル
    this.add.text(
      dropZoneX,
      dropZoneY - dropZoneHeight / 2 - 15,
      '景品獲得エリア',
      {
        font: '16px Arial',
        color: '#0000ff'
      }
    ).setOrigin(0.5);
    
    // 地面の作成（物理オブジェクトとして）
    this.ground = this.physics.add.staticGroup();
    const ground = this.ground.create(
      this.cameras.main.centerX,
      this.cameras.main.height - groundHeight * 2, 
      'crane' 
    );
    
    // デバッグモードで地面を可視化
    ground.setDisplaySize(this.cameras.main.width, groundHeight);
    ground.setTint(0x00ff00); 
    ground.setAlpha(0.3); 
    ground.refreshBody(); 
    
    // 景品グループの作成
    this.prizes = this.physics.add.group();
    
    // 景品を複数配置
    this.createPrizes(5);
    
    // 景品と地面の衝突設定
    this.physics.add.collider(this.prizes, this.ground);
    
    // 景品同士の衝突を有効に
    this.physics.add.collider(this.prizes, this.prizes);
    
    // 景品と落とし口の壁の衝突処理
    this.physics.add.collider(this.prizes, [
      this.dropZoneLeft, 
      this.dropZoneRight, 
      this.dropZoneBottom
    ]);
    
    // 景品が落とし口の底に接触したときの処理（スコア加算）
    this.physics.add.overlap(
      this.prizes,
      this.dropZoneBottom,
      (object1) => {
        const prize = object1 as Phaser.Physics.Arcade.Sprite;
        this.handlePrizeInDropZone(prize);
      },
      undefined,
      this
    );
    
    // スコアとトライ回数の表示テキストを初期化
    this.scoreText = this.add.text(
      this.cameras.main.width - 20, 
      20, 
      'スコア: 0', 
      { 
        font: '18px Arial', 
        color: '#000000' 
      }
    ).setOrigin(1, 0);
    
    this.triesText = this.add.text(
      20, 
      20, 
      `残り: ${this.triesLeft}/${this.maxTries}`, 
      { 
        font: '18px Arial', 
        color: '#000000' 
      }
    ).setOrigin(0, 0);
    
    // ゲームオーバーテキストの初期化（非表示）
    this.gameOverText = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY - 50,
      'ゲームオーバー\nもう一度プレイするには\nページをリロードしてください',
      {
        font: '24px Arial',
        color: '#ff0000',
        align: 'center',
        stroke: '#ffffff',
        strokeThickness: 4
      }
    )
    .setOrigin(0.5)
    .setVisible(false);
    
    // キャッチ成功メッセージの初期化（非表示）
    this.catchMessage = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY - 100,
      'キャッチ成功！',
      {
        font: '24px Arial',
        color: '#ff0000',
        stroke: '#ffffff',
        strokeThickness: 4
      }
    )
    .setOrigin(0.5)
    .setVisible(false);
    
    // クレーンがゲーム画面から出ないように設定
    this.crane.setCollideWorldBounds(true);
    
    // カーソルキーの入力を取得
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
    }
    
    // スマホ用のタッチ入力処理
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // ゲームオーバー時は操作不可
      if (this.gameState === 'GAME_OVER') return;
      
      const touchX = pointer.x;
      const touchY = pointer.y;
      const screenCenterX = this.cameras.main.centerX;
      const screenCenterY = this.cameras.main.centerY;
      
      if (touchY < screenCenterY) {
        // 画面上部がタップされた場合は左右移動
        if (touchX < screenCenterX) {
          // 画面左側をタッチした場合は左に移動
          this.crane.setVelocityX(-this.moveSpeed);
        } else {
          // 画面右側をタッチした場合は右に移動
          this.crane.setVelocityX(this.moveSpeed);
        }
      } else {
        // 画面下部がタップされた場合はアーム操作
        if (this.armState === 'IDLE') {
          this.armState = 'EXTENDING';
          // トライ回数を減らす
          this.decrementTries();
        }
      }
    });
    
    this.input.on('pointerup', () => {
      // ゲームオーバー時は操作不可
      if (this.gameState === 'GAME_OVER') return;
      
      // タッチが終わったら左右移動停止
      this.crane.setVelocityX(0);
      
      // アームが下降中だった場合、上昇に切り替え
      if (this.armState === 'EXTENDING') {
        this.armState = 'RETRACTING';
      }
    });
    
    // ゲーム内テキストを表示（開発中の確認用）
    this.add.text(
      this.cameras.main.centerX, 
      this.cameras.main.centerY, 
      'クレーンゲーム', 
      { 
        font: '32px Arial', 
        color: '#000000' 
      }
    ).setOrigin(0.5)
    
    // 操作説明を追加
    this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY + 50,
      '← → : クレーン移動\n↓ : アーム操作',
      {
        font: '18px Arial',
        color: '#333333',
        align: 'center'
      }
    ).setOrigin(0.5);
  }

  update() {
    // 自動移動状態の場合は、ユーザー操作を無視して落とし口へ移動
    if (this.armState === 'DELIVERING') {
      this.handleAutoDelivery();
    } 
    // 通常の操作処理
    else if (this.cursors) {
      // クレーンの左右移動処理
      if (this.cursors.left.isDown) {
        // 左キーが押されたら左に移動
        this.crane.setVelocityX(-this.moveSpeed);
        // 左右移動中はアームを操作できないようにする
        if (this.armState === 'IDLE') {
          this.resetArm();
        }
      } else if (this.cursors.right.isDown) {
        // 右キーが押されたら右に移動
        this.crane.setVelocityX(this.moveSpeed);
        // 左右移動中はアームを操作できないようにする
        if (this.armState === 'IDLE') {
          this.resetArm();
        }
      } else if (!this.input.activePointer.isDown) {
        // キーが押されていない、かつタッチ操作もない場合は停止
        this.crane.setVelocityX(0);
        
        // 左右キーが押されていない場合のみアームの操作が可能
        this.handleArmMovement();
      }
    }
    
    // アームの描画を更新
    this.drawArm();

    // 落とし口にある景品の追加チェック（overlap だけでは検出できない場合の対策）
    this.checkPrizesInDropZone();
  }
  
  // 自動移動処理を制御するメソッド
  private handleAutoDelivery() {
    // 目標位置（落とし口のX座標）との距離を計算
    const distance = Math.abs(this.crane.x - this.dropZoneX);
    
    // 十分に近づいたらリリース（許容距離 = 2px）
    if (distance < 2) {
      // クレーンを停止
      this.crane.setVelocityX(0);
      // 正確に位置を合わせる
      this.crane.x = this.dropZoneX;
      // 景品をリリース
      this.releaseAfterDelivery();
    } 
    // まだ目的地に到達していない場合
    else {
      // 現在地から見て目標位置がどちら側にあるかで移動方向を決定
      if (this.crane.x < this.dropZoneX) {
        // 右に移動
        this.crane.setVelocityX(this.deliverySpeed);
      } else {
        // 左に移動
        this.crane.setVelocityX(-this.deliverySpeed);
      }
      
      // クレーン移動中も掴んだ景品の位置を更新
      if (this.caughtPrize) {
        // フックポイントを更新（クレーンの真下）
        this.hookPoint.x = this.crane.x;
        // 景品の位置をフックポイントに合わせる
        this.caughtPrize.setPosition(this.hookPoint.x, this.hookPoint.y);
      }
    }
  }
  
  private handleArmMovement() {
    // ゲームオーバー時は操作不可
    if (this.gameState === 'GAME_OVER' || !this.cursors) return;
    
    // 下キーが押された場合、アームを伸ばす
    if (this.cursors.down.isDown && this.armState === 'IDLE') {
      this.armState = 'EXTENDING';
      // トライ回数を減らす
      this.decrementTries();
    }
    
    // アームの状態に応じた処理
    switch (this.armState) {
      case 'EXTENDING':
        // アームを下に伸ばす
        this.armLength += this.armSpeed;
        
        // 最大長さに達したら自動で戻す
        if (this.armLength >= this.maxArmLength) {
          this.armState = 'RETRACTING';
        }
        break;
        
      case 'RETRACTING':
        // アームを上に戻す
        this.armLength -= this.armSpeed;
        
        // 完全に戻ったら自動配達状態へ移行（景品を掴んでいる場合）
        if (this.armLength <= 0) {
          if (this.caughtPrize) {
            // 景品を掴んでいる場合は、自動配達状態へ移行
            this.armState = 'DELIVERING';
            // 落とし口の上へ自動移動
            this.moveToDropZone();
          } else {
            // 景品を掴んでいない場合はリセット
            this.resetArm();
          }
        }
        break;
        
      case 'DELIVERING':
        // 自動移動状態では何もしない（update内で処理）
        break;
        
      case 'IDLE':
        // アイドル状態では何もしない
        break;
    }
    
    // 下キーを離した場合、アームを戻す処理を開始
    if (this.armState === 'EXTENDING' && !this.cursors.down.isDown) {
      this.armState = 'RETRACTING';
    }
  }
  
  private resetArm() {
    // アームの状態をリセット
    this.armState = 'IDLE';
    this.armLength = 0;
  }
  
  private drawArm() {
    // 前のフレームの描画をクリア
    this.arm.clear();
    
    // アームが完全に戻ったときに景品をリリース
    if (this.armState === 'RETRACTING' && this.armLength <= 0 && this.caughtPrize) {
      this.releasePrize();
    }
    
    // アームの長さが0以上の場合のみ描画
    if (this.armLength > 0) {
      // クレーン本体の中央下部からアームを描画
      const startX = this.crane.x;
      const startY = this.crane.y + this.crane.displayHeight / 2;
      const endY = startY + this.armLength;
      
      // アームの線を描画（垂直線）
      this.arm.beginPath();
      this.arm.moveTo(startX, startY);
      this.arm.lineTo(startX, endY);
      this.arm.strokePath();
      
      // フックポイントの座標を更新（接触判定用）
      this.hookPoint.x = startX;
      this.hookPoint.y = endY;
      
      // アームの先端にフック（クロー）を描画
      this.drawClaw(startX, endY);
      
      // アームが伸びている時にのみ、景品との接触判定をチェック
      if (this.armState === 'EXTENDING' && !this.caughtPrize) {
        this.checkPrizeCollision();
      }
      
      // 捕まえた景品がある場合、フックポイントに移動させる
      if (this.caughtPrize) {
        this.caughtPrize.setPosition(this.hookPoint.x, this.hookPoint.y);
      }
    }
  }
  
  private drawClaw(x: number, y: number) {
    // クローの大きさ
    const clawSize = 10;
    
    // クローの左側
    this.arm.beginPath();
    this.arm.moveTo(x, y);
    this.arm.lineTo(x - clawSize, y + clawSize);
    this.arm.strokePath();
    
    // クローの右側
    this.arm.beginPath();
    this.arm.moveTo(x, y);
    this.arm.lineTo(x + clawSize, y + clawSize);
    this.arm.strokePath();
  }

  // 景品を生成するメソッド
  private createPrizes(count: number) {
    const gameWidth = this.cameras.main.width;
    const groundY = this.cameras.main.height - 40; // 地面と同じY座標計算
    
    // 落とし口エリアの幅と位置を考慮
    const dropZoneWidth = 150;
    const margin = 20; // 余白
    const minX = dropZoneWidth + margin; // 落とし口の右端 + 余白
    
    for (let i = 0; i < count; i++) {
      // 落とし口を避けてランダムなX位置に景品を配置
      const x = Phaser.Math.Between(minX, gameWidth - margin);
      // 地面の30ピクセル上に配置
      const y = groundY - 30;
      
      const prize = this.prizes.create(x, y, 'prize');
      
      // 景品のサイズを小さく調整
      prize.setScale(0.15);
      
      // 物理特性を設定
      prize.setCollideWorldBounds(true);
      prize.setBounce(0.1);
      
      if (prize.body) {
        prize.body.allowGravity = true;
        
        // 景品の当たり判定サイズを調整
        const hitboxSize = prize.displayWidth * 0.8;
        prize.body.setSize(hitboxSize, hitboxSize);
        
        // 景品が回転しすぎないように抵抗を設定
        prize.body.setAngularDrag(200);
        prize.body.setDrag(20);
      }
    }
    
    // 重力を弱めに設定し、景品の落下速度を遅く
    this.physics.world.gravity.y = 150;
  }

  // 景品との接触判定をチェックするメソッド
  private checkPrizeCollision() {
    // フックポイント（アームの先端）周辺の接触判定
    const hookRadius = 30; // 20から30に拡大（より広い範囲で接触判定）
    
    // すべての景品に対して距離をチェック
    this.prizes.getChildren().forEach((child) => {
      const prize = child as Phaser.Physics.Arcade.Sprite;
      
      // フックと景品の距離を計算
      const distance = Phaser.Math.Distance.Between(
        this.hookPoint.x,
        this.hookPoint.y,
        prize.x,
        prize.y
      );
      
      // 距離が一定範囲内なら景品をつかむ
      if (distance < hookRadius) {
        this.catchPrize(prize);
      }
    });
  }
  
  // 景品をつかむメソッド
  private catchPrize(prize: Phaser.Physics.Arcade.Sprite) {
    if (!this.caughtPrize) {
      this.caughtPrize = prize;
      
      // 物理演算を無効化（クレーンアームに固定するため）
      if (prize.body) {
        // 重力を無効化
        (prize.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        // velocity.setを使用してvelocityを直接設定
        prize.body.velocity.set(0, 0);
        // angularVelocityプロパティの代わりに別の方法で回転を止める
        prize.setAngularVelocity(0);
      }
      
      // 景品の角度を水平に固定（代替方法）
      prize.setRotation(0);
      
      // 上昇処理に切り替え
      this.armState = 'RETRACTING';
    }
  }
  
  // 景品を離すメソッド
  private releasePrize() {
    if (this.caughtPrize) {
      // キャッチ成功メッセージを表示
      // 注: スコア加算は落とし口に入ったときに行うように変更
      this.showCatchMessage();
      
      // 物理演算を再度有効化
      if (this.caughtPrize.body) {
        // 重力を有効化
        (this.caughtPrize.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
      }
      
      // 景品の参照をクリア
      this.caughtPrize = null;
    }
  }
  
  // キャッチ成功メッセージを表示するメソッド
  private showCatchMessage() {
    if (this.catchMessage) {
      // メッセージを表示
      this.catchMessage.setVisible(true);
      
      // 既存のタイマーがあればキャンセル
      if (this.messageTimer) {
        this.messageTimer.remove();
      }
      
      // 2秒後にメッセージを非表示にするタイマー
      this.messageTimer = this.time.delayedCall(2000, () => {
        if (this.catchMessage) {
          this.catchMessage.setVisible(false);
        }
      });
    }
  }

  // トライ回数を減らすメソッド
  private decrementTries() {
    if (this.gameState === 'GAME_OVER') return;
    
    this.triesLeft--;
    // トライ回数表示を更新
    this.updateTriesText();
    
    // トライ回数が0になったら（残り0回）
    // この時点ではまだゲームオーバーにせず、現在の操作が完了するのを待つ
    if (this.triesLeft < 0) {
      // 残り回数が0未満になったら（操作完了後）ゲームオーバー
      this.gameOver();
    }
  }
  
  // トライ回数表示を更新するメソッド
  private updateTriesText() {
    this.triesText.setText(`残り: ${this.triesLeft}/${this.maxTries}`);
  }
  
  // スコアを加算するメソッド
  private incrementScore() {
    this.score++;
    this.scoreText.setText(`スコア: ${this.score}`);
  }
  
  // ゲームオーバー処理
  private gameOver() {
    this.gameState = 'GAME_OVER';
    this.gameOverText.setVisible(true);
    
    // クレーンを停止
    this.crane.setVelocityX(0);
    this.resetArm();
  }

  // 景品が落とし口の底に接触したときの処理
  private handlePrizeInDropZone(prize: Phaser.Physics.Arcade.Sprite) {
    // まだ獲得していない景品の場合のみ処理
    if (!this.collectedPrizes.has(prize)) {
      // スコア加算
      this.incrementScore();
      
      // 獲得済みセットに追加
      this.collectedPrizes.add(prize);
      
      // 「獲得！」メッセージを表示
      const successText = this.add.text(
        prize.x, 
        prize.y - 20, 
        '獲得！', 
        { 
          font: '16px Arial', 
          color: '#ff0000',
          stroke: '#ffffff',
          strokeThickness: 2
        }
      ).setOrigin(0.5);
      
      // メッセージを上に移動しながらフェードアウト
      this.tweens.add({
        targets: successText,
        y: successText.y - 30,
        alpha: 0,
        duration: 1000,
        onComplete: () => {
          successText.destroy();
        }
      });
      
      // 景品をフェードアウトさせて消す
      this.tweens.add({
        targets: prize,
        alpha: 0,
        scale: prize.scale * 0.8,
        duration: 800,
        onComplete: () => {
          // 完全に消す（グループから削除）
          this.prizes.remove(prize, true, true);
        }
      });
    }
  }

  // 落とし口の上へ自動移動を開始するメソッド
  private moveToDropZone() {
    // 落とし口の上に移動するための目標X座標
    const targetX = this.dropZoneX;
    
    // 左右どちらに移動するか
    if (this.crane.x < targetX) {
      // 右に移動
      this.crane.setVelocityX(this.deliverySpeed);
    } else if (this.crane.x > targetX) {
      // 左に移動
      this.crane.setVelocityX(-this.deliverySpeed);
    } else {
      // すでに目標位置にいる場合は景品をリリース
      this.releaseAfterDelivery();
    }
    
    // デバッグログ
    console.log('自動移動開始: クレーン位置 =', this.crane.x, '目標位置 =', targetX);
  }
  
  // 景品配達完了後にリリースするメソッド
  private releaseAfterDelivery() {
    if (this.caughtPrize) {
      // キャッチ成功メッセージを表示
      this.showCatchMessage();
      
      // 物理演算を再度有効化して落下させる
      if (this.caughtPrize.body) {
        (this.caughtPrize.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
      }
      
      // 景品の参照をクリア
      this.caughtPrize = null;
      
      // アイドル状態に戻す
      this.resetArm();
      
      console.log('景品を落とし口上でリリースしました');
    }
  }

  // 落とし口エリア内の景品をチェックする（位置ベースの判定）
  private checkPrizesInDropZone() {
    // 落とし口の領域を定義
    const dropZoneLeft = this.dropZoneX - 75; // 落とし口の幅は150
    const dropZoneRight = this.dropZoneX + 75;
    const dropZoneTop = this.cameras.main.height - 140; // おおよその落とし口上部
    const dropZoneBottom = this.cameras.main.height - 40; // おおよその落とし口底部

    // すべての景品をチェック
    this.prizes.getChildren().forEach((child) => {
      const prize = child as Phaser.Physics.Arcade.Sprite;
      
      // 既に獲得済みの景品はスキップ
      if (this.collectedPrizes.has(prize)) return;
      
      // 景品が落とし口エリア内にあるかチェック
      if (prize.x > dropZoneLeft && prize.x < dropZoneRight && 
          prize.y > dropZoneTop && prize.y < dropZoneBottom) {
        
        // 景品が静止状態（ほぼ動いていない）かチェック
        if (prize.body && Math.abs(prize.body.velocity.y) < 10) {
          // 獲得処理
          this.handlePrizeInDropZone(prize);
          console.log('エリア内景品検出: x=', prize.x, 'y=', prize.y);
        }
      }
    });
  }
}

// Phaserゲームの設定
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 360,
  height: 640,
  backgroundColor: '#f0f0f0',
  parent: 'app',
  scene: [MainScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: {
        y: 150, // 世界の重力をここで一度だけ設定
        x: 0
      },
      debug: false
    }
  }
}

// ゲームインスタンスを生成
new Phaser.Game(config)
