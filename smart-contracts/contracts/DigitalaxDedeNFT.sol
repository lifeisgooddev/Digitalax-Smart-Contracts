// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./ERC721/ERC721WithSameTokenURIForAllTokens.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./DigitalaxAccessControls.sol";

/**
 * @title Digitalax Dede NFT
 * @dev To facilitate the dede sale for the Digitialax platform
 */
contract DigitalaxDedeNFT is ERC721WithSameTokenURIForAllTokens("DigitalaxDede", "DXD") {
    using SafeMath for uint256;

    // @notice event emitted upon construction of this contract, used to bootstrap external indexers
    event DigitalaxDedeNFTContractDeployed();

    // @notice event emitted when a contributor buys a Dede NFT
    event DedePurchased(
        address indexed buyer,
        uint256 indexed tokenId,
        uint256 contribution
    );

    // @notice event emitted when a admin mints a Dede NFT
    event AdminDedeMinted(
        address indexed beneficiary,
        address indexed admin,
        uint256 indexed tokenId
    );

    // @notice event emitted when a contributors amount is increased
    event ContributionIncreased(
        address indexed buyer,
        uint256 contribution
    );

    // @notice event emitted when end date is changed
    event DedeEndUpdated(
        uint256 dedeEndTimestamp,
        address indexed admin
    );

    // @notice event emitted when DigitalaxAccessControls is updated
    event AccessControlsUpdated(
        address indexed newAdress
    );

    // @notice responsible for enforcing admin access
    DigitalaxAccessControls public accessControls;

    // @notice all funds will be sent to this address pon purchase of a Dede NFT
    address payable public fundsMultisig;

    // @notice start date for them the Dede sale is open to the public, before this data no purchases can be made
    uint256 public dedeStartTimestamp;

    // @notice end date for them the Dede sale is closed, no more purchased can be made after this point
    uint256 public dedeEndTimestamp;

    // @notice set after end time has been changed once, prevents further changes to end timestamp
    bool public dedeEndTimestampLocked;

    // @notice set the transfer lock time, so no noe can move Dede NFT
    uint256 public dedeLockTimestamp;

    // @notice the minimum amount a buyer can contribute in a single go
    uint256 public constant minimumContributionAmount = 1 ether;

    // @notice accumulative => contribution total
    mapping(address => uint256) public contribution;

    // @notice global accumulative contribution amount
    uint256 public totalContributions;

    // @notice max number of paid contributions to the dede sale
    uint256 public constant maxDedeContributionTokens = 500;

    uint256 public totalAdminMints;

    constructor(
        DigitalaxAccessControls _accessControls,
        address payable _fundsMultisig,
        uint256 _dedeStartTimestamp,
        uint256 _dedeEndTimestamp,
        uint256 _dedeLockTimestamp,
        string memory _tokenURI
    ) public {
        accessControls = _accessControls;
        fundsMultisig = _fundsMultisig;
        dedeStartTimestamp = _dedeStartTimestamp;
        dedeEndTimestamp = _dedeEndTimestamp;
        dedeLockTimestamp = _dedeLockTimestamp;
        tokenURI_ = _tokenURI;
        emit DigitalaxDedeNFTContractDeployed();
    }

    /**
     * @dev Proxy method for facilitating a single point of entry to either buy or contribute additional value to the Dede sale
     * @dev Cannot contribute less than minimumContributionAmount
     */
    function buyOrIncreaseContribution() external payable {
        if (contribution[_msgSender()] == 0) {
            buy();
        } else {
            increaseContribution();
        }
    }

    /**
     * @dev Facilitating the initial purchase of a Dede NFT
     * @dev Cannot contribute less than minimumContributionAmount
     * @dev Reverts if already owns an dede token
     * @dev Buyer receives a NFT on success
     * @dev All funds move to fundsMultisig
     */
    function buy() public payable {
        require(contribution[_msgSender()] == 0, "DigitalaxDedeNFT.buy: You already own a dede NFT");
        require(
            _getNow() >= dedeStartTimestamp && _getNow() <= dedeEndTimestamp,
            "DigitalaxDedeNFT.buy: No dede are available outside of the dede window"
        );

        uint256 _contributionAmount = msg.value;
        require(
            _contributionAmount >= minimumContributionAmount,
            "DigitalaxDedeNFT.buy: Contribution does not meet minimum requirement"
        );

        require(remainingDedeTokens() > 0, "DigitalaxDedeNFT.buy: Total number of dede token holders reached");

        contribution[_msgSender()] = _contributionAmount;
        totalContributions = totalContributions.add(_contributionAmount);

        (bool fundsTransferSuccess,) = fundsMultisig.call{value : _contributionAmount}("");
        require(fundsTransferSuccess, "DigitalaxDedeNFT.buy: Unable to send contribution to funds multisig");

        uint256 tokenId = totalSupply().add(1);
        _safeMint(_msgSender(), tokenId);

        emit DedePurchased(_msgSender(), tokenId, _contributionAmount);
    }

    /**
     * @dev Facilitates an owner to increase there contribution
     * @dev Cannot contribute less than minimumContributionAmount
     * @dev Reverts if caller does not already owns an dede token
     * @dev All funds move to fundsMultisig
     */
    function increaseContribution() public payable {
        require(
            _getNow() >= dedeStartTimestamp && _getNow() <= dedeEndTimestamp,
            "DigitalaxDedeNFT.increaseContribution: No increases are possible outside of the dede window"
        );

        require(
            contribution[_msgSender()] > 0,
            "DigitalaxDedeNFT.increaseContribution: You do not own a dede NFT"
        );

        uint256 _amountToIncrease = msg.value;
        contribution[_msgSender()] = contribution[_msgSender()].add(_amountToIncrease);

        totalContributions = totalContributions.add(_amountToIncrease);

        (bool fundsTransferSuccess,) = fundsMultisig.call{value : _amountToIncrease}("");
        require(
            fundsTransferSuccess,
            "DigitalaxDedeNFT.increaseContribution: Unable to send contribution to funds multisig"
        );

        emit ContributionIncreased(_msgSender(), _amountToIncrease);
    }

    // Admin

    /**
     * @dev Allows a whitelisted admin to mint a token and issue it to a beneficiary
     * @dev One token per holder
     * @dev All holders contribution as set o zero on creation
     */
    function adminBuy(address _beneficiary) external {
        require(
            accessControls.hasAdminRole(_msgSender()),
            "DigitalaxDedeNFT.adminBuy: Sender must be admin"
        );
        require(_beneficiary != address(0), "DigitalaxDedeNFT.adminBuy: Beneficiary cannot be ZERO");
        require(balanceOf(_beneficiary) == 0, "DigitalaxDedeNFT.adminBuy: Beneficiary already owns a dede NFT");

        uint256 tokenId = totalSupply().add(1);
        _safeMint(_beneficiary, tokenId);

        // Increase admin mint counts
        totalAdminMints = totalAdminMints.add(1);

        emit AdminDedeMinted(_beneficiary, _msgSender(), tokenId);
    }

    /**
     * @dev Allows a whitelisted admin to update the end date of the dede
     */
    function updateDedeEnd(uint256 _end) external {
        require(
            accessControls.hasAdminRole(_msgSender()),
            "DigitalaxDedeNFT.updateDedeEnd: Sender must be admin"
        );
        // If already passed, dont allow opening again
        require(dedeEndTimestamp > _getNow(), "DigitalaxDedeNFT.updateDedeEnd: End time already passed");

        // Only allow setting this once
        require(!dedeEndTimestampLocked, "DigitalaxDedeNFT.updateDedeEnd: End time locked");

        dedeEndTimestamp = _end;

        // Lock future end time modifications
        dedeEndTimestampLocked = true;

        emit DedeEndUpdated(dedeEndTimestamp, _msgSender());
    }

    /**
     * @dev Allows a whitelisted admin to update the start date of the dede
     */
    function updateAccessControls(DigitalaxAccessControls _accessControls) external {
        require(
            accessControls.hasAdminRole(_msgSender()),
            "DigitalaxDedeNFT.updateAccessControls: Sender must be admin"
        );
        require(address(_accessControls) != address(0), "DigitalaxDedeNFT.updateAccessControls: Zero Address");
        accessControls = _accessControls;

        emit AccessControlsUpdated(address(_accessControls));
    }

    /**
    * @dev Returns total remaining number of tokens available in the Dede sale
    */
    function remainingDedeTokens() public view returns (uint256) {
        return _getMaxDedeContributionTokens() - (totalSupply() - totalAdminMints);
    }

    // Internal

    function _getNow() internal virtual view returns (uint256) {
        return block.timestamp;
    }

    function _getMaxDedeContributionTokens() internal virtual view returns (uint256) {
        return maxDedeContributionTokens;
    }

    /**
     * @dev Before token transfer hook to enforce that no token can be moved to another address until the dede sale has ended
     */
    function _beforeTokenTransfer(address from, address, uint256) internal override {
        if (from != address(0) && _getNow() <= dedeLockTimestamp) {
            revert("DigitalaxDedeNFT._beforeTokenTransfer: Transfers are currently locked at this time");
        }
    }
}
