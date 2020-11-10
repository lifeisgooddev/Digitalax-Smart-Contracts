const { BN, constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { ZERO_ADDRESS } = constants;
const web3 = require('web3');
const { expect } = require('chai');

const { shouldBehaveLikeERC1155 } = require('./ERC1155.behavior');
const DigitalaxAccessControls = artifacts.require('DigitalaxAccessControls');
const DigitalaxMaterials = artifacts.require('DigitalaxMaterials');

contract('DigitalaxMaterials 1155 behaviour tests', function ([admin, operator, tokenHolder, tokenBatchHolder, ...otherAccounts]) {
  const name = "DigitalaxMaterials";
  const symbol = "DXM";

  const initialURI = 'https://token-cdn-domain/{id}.json';
  const emptyData = web3.utils.encodePacked('');

  const STRAND_ONE_ID = '1';

  beforeEach(async function () {
    this.accessControls = await DigitalaxAccessControls.new({from: admin});
    await this.accessControls.addSmartContractRole(operator, {from: admin});
    await this.accessControls.addSmartContractRole(otherAccounts[0], {from: admin}); // zero index is minter in the behaviour test

    this.token = await DigitalaxMaterials.new(
      name,
      symbol,
      this.accessControls.address,
      {from: admin}
    );

    expect(await this.token.name()).to.be.equal(name);
    expect(await this.token.symbol()).to.be.equal(symbol);

    await this.token.createChild(initialURI, {from: operator});
  });

  shouldBehaveLikeERC1155(otherAccounts);

  describe('internal functions', function () {
    const tokenId = new BN('1');
    const mintAmount = new BN(9001);
    const burnAmount = new BN(3000);

    const tokenBatchIds = [new BN('1'), new BN('2'), new BN('3')];
    const mintAmounts = [new BN(5000), new BN(10000), new BN(42195)];
    const burnAmounts = [new BN(5000), new BN(9001), new BN(195)];

    const data = '0x12345678';

    describe('_mint', function () {
      it('reverts with a zero destination address', async function () {
        await expectRevert(
          this.token.mintChild(STRAND_ONE_ID, mintAmount, ZERO_ADDRESS, emptyData, {from: operator}),
          'ERC1155: mint to the zero address',
        );
      });

      context('with minted tokens', function () {
        beforeEach(async function () {
          ({logs: this.logs} = await this.token.mintChild(
              STRAND_ONE_ID,
              mintAmount,
              tokenHolder,
              emptyData,
              {from: operator}
            )
          );
        });

        it('emits a TransferSingle event', function () {
          expectEvent.inLogs(this.logs, 'TransferSingle', {
            operator,
            from: ZERO_ADDRESS,
            to: tokenHolder,
            id: tokenId,
            value: mintAmount,
          });
        });

        it('credits the minted amount of tokens', async function () {
          expect(await this.token.balanceOf(tokenHolder, tokenId)).to.be.bignumber.equal(mintAmount);
        });
      });
    });

    describe('_mintBatch', function () {
      beforeEach(async function () {
        await this.token.batchCreateChildren(
          [initialURI, initialURI, initialURI],
          {from: operator}
        );
      });

      it('reverts with a zero destination address', async function () {
        await expectRevert(
          this.token.batchMintChildren(tokenBatchIds, mintAmounts, ZERO_ADDRESS, web3.utils.encodePacked(''), {from: operator}),
          'ERC1155: mint to the zero address',
        );
      });

      it('reverts if length of inputs do not match', async function () {
        await expectRevert(
          this.token.batchMintChildren(tokenBatchIds, mintAmounts.slice(1), tokenBatchHolder, web3.utils.encodePacked(''), {from: operator}),
          'DigitalaxMaterials.batchMintChildren: Array lengths are invalid',
        );

        await expectRevert(
          this.token.batchMintChildren(tokenBatchIds.slice(1), mintAmounts, tokenBatchHolder, web3.utils.encodePacked(''), {from: operator}),
          'DigitalaxMaterials.batchMintChildren: Array lengths are invalid',
        );
      });

      context('with minted batch of tokens', function () {
        beforeEach(async function () {
          ({logs: this.logs} = await this.token.batchMintChildren(
            tokenBatchIds,
            mintAmounts,
            tokenBatchHolder,
            web3.utils.encodePacked(''),
            {from: operator},
          ));
        });

        it('emits a TransferBatch event', function () {
          expectEvent.inLogs(this.logs, 'TransferBatch', {
            operator,
            from: ZERO_ADDRESS,
            to: tokenBatchHolder,
          });
        });

        it('credits the minted batch of tokens', async function () {
          const holderBatchBalances = await this.token.balanceOfBatch(
            new Array(tokenBatchIds.length).fill(tokenBatchHolder),
            tokenBatchIds,
          );

          for (let i = 0; i < holderBatchBalances.length; i++) {
            // add one because of batchcreateChild
            expect(holderBatchBalances[i]).to.be.bignumber.equal(mintAmounts[i]);
          }
        });
      });
    });

    describe('_burn', function () {
      it('reverts when burning the zero account\'s tokens', async function () {
        await expectRevert(
          this.token.burn(ZERO_ADDRESS, tokenId, mintAmount),
          "ERC1155: caller is not owner nor approved"
        );
      });

      it('reverts when burning a non-existent token id', async function () {
        await expectRevert(
          this.token.burn(tokenHolder, tokenId, mintAmount, {from: tokenHolder}),
          'ERC1155: burn amount exceeds balance'
        );
      });

      it('reverts when burning more than available tokens', async function () {
        await this.token.mintChild(
          STRAND_ONE_ID,
          mintAmount,
          tokenHolder,
          data,
          {from: operator}
        )

        await expectRevert(
          this.token.burn(tokenHolder, tokenId, mintAmount.addn(1), {from: tokenHolder}),
          'ERC1155: burn amount exceeds balance'
        );
      });

      context('with minted-then-burnt tokens', function () {
        beforeEach(async function () {
          await this.token.mintChild(
            STRAND_ONE_ID,
            mintAmount,
            tokenHolder,
            emptyData,
            {from: operator}
          );

          await this.token.setApprovalForAll(operator, true, {from: tokenHolder});

          ({logs: this.logs} = await this.token.burn(
            tokenHolder,
            tokenId,
            burnAmount,
            {from: operator}
          ));
        });

        it('emits a TransferSingle event', function () {
          expectEvent.inLogs(this.logs, 'TransferSingle', {
            operator,
            from: tokenHolder,
            to: ZERO_ADDRESS,
            id: tokenId,
            value: burnAmount,
          });
        });

        it('accounts for both minting and burning', async function () {
          expect(await this.token.balanceOf(
            tokenHolder,
            tokenId
          )).to.be.bignumber.equal(mintAmount.sub(burnAmount));
        });
      });
    });

    describe('_burnBatch', function () {
      it('reverts when burning the zero account\'s tokens', async function () {
        await expectRevert(
          this.token.burnBatch(ZERO_ADDRESS, tokenBatchIds, burnAmounts),
          "ERC1155: caller is not owner nor approved"
        );
      });

      it('reverts if length of inputs do not match', async function () {
        await expectRevert(
          this.token.burnBatch(tokenBatchHolder, tokenBatchIds, burnAmounts.slice(1), {from: tokenBatchHolder}),
          'ERC1155: ids and amounts length mismatch'
        );

        await expectRevert(
          this.token.burnBatch(tokenBatchHolder, tokenBatchIds.slice(1), burnAmounts, {from: tokenBatchHolder}),
          'ERC1155: ids and amounts length mismatch'
        );
      });

      it('reverts when burning a non-existent token id', async function () {
        await expectRevert(
          this.token.burnBatch(tokenBatchHolder, tokenBatchIds, burnAmounts, {from: tokenBatchHolder}),
          'ERC1155: burn amount exceeds balance'
        );
      });

      context('with minted-then-burnt tokens', function () {
        beforeEach(async function () {
          await this.token.batchCreateChildren(
            [initialURI, initialURI, initialURI],
            {from: operator}
          );

          ({logs: this.logs} = await this.token.batchMintChildren(
            tokenBatchIds,
            mintAmounts,
            tokenBatchHolder,
            data,
            {from: operator},
          ));

          await this.token.setApprovalForAll(operator, true, {from: tokenBatchHolder});

          ({logs: this.logs} = await this.token.burnBatch(
            tokenBatchHolder,
            tokenBatchIds,
            burnAmounts,
            {from: operator}
          ));
        });

        it('emits a TransferBatch event', function () {
          expectEvent.inLogs(this.logs, 'TransferBatch', {
            operator,
            from: tokenBatchHolder,
            to: ZERO_ADDRESS,
            // ids: tokenBatchIds,
            // values: burnAmounts,
          });
        });

        it('accounts for both minting and burning', async function () {
          const holderBatchBalances = await this.token.balanceOfBatch(
            new Array(tokenBatchIds.length).fill(tokenBatchHolder),
            tokenBatchIds
          );

          for (let i = 0; i < holderBatchBalances.length; i++) {
            expect(holderBatchBalances[i]).to.be.bignumber.equal(mintAmounts[i].sub(burnAmounts[i]));
          }
        });
      });
    });
  });

  describe('ERC1155MetadataURI', function () {
    const secondTokenID = new BN('2');

    const secondTokenURI = 'random';

    it('sets the first token URI correctly', async function() {
      expect(await this.token.uri(STRAND_ONE_ID)).to.be.equal(initialURI);
    });

    it('sets the first and second token URI correctly', async function() {
      expect(await this.token.uri(STRAND_ONE_ID)).to.be.equal(initialURI);

      await this.token.createChild(secondTokenURI, {from: otherAccounts[0]});
      expect(await this.token.uri(secondTokenID)).to.be.equal(secondTokenURI);
    });
  });
});
